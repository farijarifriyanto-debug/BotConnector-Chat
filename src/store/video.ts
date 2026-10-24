import { create } from 'zustand'
import { fetchVideoJob, fetchVideoModels, quoteVideo, submitVideo, type VideoJob, type VideoModel, type VideoQuote } from '../api/api'

const POLL_MS = 4000, GIVE_UP_MS = 8 * 60 * 1000
const RUNNING = new Set(['created', 'submitting', 'submitted', 'polling', 'processing', 'still_processing'])

interface State {
  models: VideoModel[]; selectedId: string; state: 'idle' | 'loading' | 'ready' | 'error'
  quote: VideoQuote | null; job: VideoJob | null; busy: boolean; error: string | null
  load(): Promise<void>
  select(id: string): void
  /** price for the current model/aspect (and source picture, when the model needs one) */
  askQuote(opts: { aspect: string; sourceSha256?: string }): Promise<void>
  create(opts: { prompt: string; aspect: string; sourceBase64?: string; sourceMime?: string; sourceSha256?: string }): Promise<void>
  cancel(): void
  clear(): void
}

let poll: ReturnType<typeof setTimeout> | null = null
let generation = 0

export const useVideo = create<State>((set, get) => {
  const stopPoll = () => { if (poll) clearTimeout(poll); poll = null }
  const watch = (id: string, startedAt = Date.now()) => {
    const mine = ++generation
    const tick = async () => {
      if (mine !== generation) return
      try {
        const job = await fetchVideoJob(id)
        if (mine !== generation) return
        set({ job })
        if (RUNNING.has(job.status) && Date.now() - startedAt < GIVE_UP_MS) { poll = setTimeout(() => void tick(), POLL_MS); return }
        stopPoll(); set({ busy: RUNNING.has(job.status) })
      } catch {
        if (mine !== generation) return
        stopPoll(); set({ busy: false, error: 'video_status_failed' })
      }
    }
    poll = setTimeout(() => void tick(), POLL_MS)
  }
  return {
    models: [], selectedId: '', state: 'idle', quote: null, job: null, busy: false, error: null,
    async load() {
      set({ state: 'loading', error: null })
      try {
        const models = await fetchVideoModels()
        set(s => ({ models, state: 'ready', selectedId: s.selectedId && models.some(m => m.id === s.selectedId) ? s.selectedId : models[0]?.id ?? '' }))
      } catch { set({ state: 'error' }) }
    },
    select(id) { set({ selectedId: id, quote: null, error: null }) },
    async askQuote(opts) {
      const { selectedId } = get()
      if (!selectedId) return
      try { set({ quote: await quoteVideo({ model: selectedId, aspect: opts.aspect, ...(opts.sourceSha256 ? { sourceSha256: opts.sourceSha256 } : {}) }) }) }
      catch { set({ quote: null }) }   // no price: the button stays off rather than surprising anyone
    },
    async create(opts) {
      const { selectedId, quote, busy } = get()
      if (busy || !selectedId || !quote) return
      set({ busy: true, error: null, job: null })
      try {
        const job = await submitVideo({
          model: selectedId, prompt: opts.prompt.trim(), aspect: opts.aspect, quoteToken: quote.token,
          idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          ...(opts.sourceBase64 ? { sourceBase64: opts.sourceBase64, sourceMime: opts.sourceMime, sourceSha256: opts.sourceSha256 } : {}),
        })
        set({ job, quote: null })
        if (RUNNING.has(job.status)) watch(job.id)
        else set({ busy: false })
      } catch (e) {
        set({ busy: false, error: (e as { kind?: string })?.kind === 'payg' ? 'video_needs_balance' : 'video_failed' })
      }
    },
    cancel() { stopPoll(); generation++; set({ busy: false }) },
    clear() { stopPoll(); generation++; set({ job: null, quote: null, error: null, busy: false }) },
  }
})
