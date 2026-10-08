import { create } from 'zustand'
import { fetchCapabilities, fetchModels, streamCompletion, type Capabilities } from '../api/api'
import { deleteConv, listConvs, putConv } from '../db/convs'
import { runAssistant } from '../lib/agent'
import { composedSystem, newConv, newId, titleFrom, toApiMessages } from '../lib/conv'
import { research, ResearchError, type Progress } from '../lib/research'
import { ChatError, type ChatModel, type Conv, type Msg } from '../lib/types'
import { useSettings } from './settings'

const TITLE_PROMPT = 'Write a short title (at most 6 words) for this conversation, in the same language as the user. No quotes, no trailing punctuation. Reply with the title only.'
export interface RunStatus { searching?: string; reading?: string; research?: Progress }
export interface SendOptions { web: boolean; research: boolean }
type ModelsState = 'idle' | 'loading' | 'ready' | 'error' | 'auth'

interface ChatState {
  convs: Conv[]; activeId: string | null; draft: Conv | null
  models: ChatModel[]; modelId: string; modelsState: ModelsState; caps: Capabilities | null
  busy: boolean; status: RunStatus | null
  init(): Promise<void>; loadModels(): Promise<void>
  selectModel(id: string): void; newChat(): void; open(id: string): void; remove(id: string): Promise<void>; reset(): void
  send(text: string, opts: SendOptions): Promise<void>; regenerate(opts: SendOptions): Promise<void>; stop(): void
}

let controller: AbortController | null = null

export const currentConv = (s: Pick<ChatState, 'convs' | 'activeId' | 'draft'>): Conv | null => (s.activeId ? s.convs.find(c => c.id === s.activeId) ?? null : s.draft)
const sortConvs = (list: Conv[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)
const errorCode = (e: unknown) => {
  if (e instanceof ResearchError) return 'research:' + e.code
  const err = e instanceof ChatError ? e : new ChatError('network')
  return err.kind + (err.retryAfterSeconds ? ':' + err.retryAfterSeconds : '')
}

export const useChat = create<ChatState>((set, get) => {
  const put = (c: Conv) => { set(s => ({ convs: sortConvs([c, ...s.convs.filter(x => x.id !== c.id)]), activeId: c.id, draft: s.draft?.id === c.id ? null : s.draft })) }
  const replace = (c: Conv) => set(s => ({ convs: s.convs.map(x => (x.id === c.id ? c : x)) }))

  async function autoTitle(id: string, initial: string, q: string, a: string) {
    const { models } = get(); const fm = models.find(x => x.access === 'free' && x.available && !x.reasoning); if (!fm) return
    try {
      let out = ''
      for await (const d of streamCompletion({ model: fm.id, max_tokens: 32, temperature: 0.3, messages: [{ role: 'system', content: TITLE_PROMPT }, { role: 'user', content: `${q.slice(0, 500)}\n---\n${a.slice(0, 500)}` }] })) { if (d.content) out += d.content; if (out.length > 240) break }
      const title = (out.split('\n').map(x => x.trim()).find(Boolean) ?? '').replace(/^["'“”‘’«»`*#\s]+|["'“”‘’«»`*.\s]+$/g, '').slice(0, 60)
      if (title.length < 2) return
      const cur = get().convs.find(c => c.id === id); if (!cur || cur.titled || cur.title !== initial) return   // renamed meanwhile: keep it
      const next = { ...cur, title, titled: true }; replace(next); await putConv(next)
    } catch { /* the first words of the question stay as the title */ }
  }

  /** One assistant turn: streams text into the last message, then stores the chat. */
  async function run(base: Conv, history: Msg[], opts: SendOptions) {
    const { models, modelId, convs, caps } = get()
    const m = models.find(x => x.id === base.model) ?? models.find(x => x.id === modelId); if (!m) return
    const aId = newId(), t0 = Date.now()
    let cur: Conv = { ...base, model: m.id, messages: [...history, { id: aId, role: 'assistant', content: '', createdAt: Date.now(), model: m.name }], updatedAt: Date.now() }
    controller = new AbortController(); const signal = controller.signal
    set({ busy: true, status: null }); put(cur)
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => { timer = null; replace(cur) }
    const update = (patch: Partial<Msg>, now = false) => {
      cur = { ...cur, messages: cur.messages.map(x => (x.id === aId ? { ...x, ...patch } : x)) }
      if (now) { if (timer) clearTimeout(timer); flush() } else if (!timer) timer = setTimeout(flush, 60)   // at most ~16 repaints a second while streaming
    }
    try {
      const question = [...history].reverse().find(x => x.role === 'user')?.content.trim() ?? ''
      if (opts.research && caps?.web !== false) {
        const planner = models.find(x => x.access === 'free' && x.available && !x.reasoning) ?? m
        const res = await research({ question, history: toApiMessages('', history.slice(0, -1), false), system: composedSystem(base, convs), writer: m, planner, signal,
          onProgress: p => set({ status: { research: p } }), onText: c => update({ content: c }), onReasoning: r => update({ reasoning: r }) })
        update({ content: res.content, reasoning: res.reasoning || undefined, sources: res.sources, searched: res.queries, research: { searches: res.searches, pages: res.pages }, ms: Date.now() - t0 }, true)
      } else {
        const res = await runAssistant({ model: m, messages: toApiMessages(composedSystem(base, convs), history, m.vision), web: opts.web && caps?.web !== false, fileIds: [], signal,
          onText: c => update({ content: c }), onReasoning: r => update({ reasoning: r }), onStatus: s => set({ status: s }) })
        update({ content: res.content, reasoning: res.reasoning || undefined, sources: res.sources.length ? res.sources : undefined, searched: res.queries.length ? res.queries : undefined, ms: Date.now() - t0 }, true)
      }
      const firstQ = history.filter(x => x.role === 'user')
      if (!base.titled && firstQ.length === 1 && cur.messages.at(-1)?.content && base.title === titleFrom(firstQ[0].content)) void autoTitle(base.id, base.title, firstQ[0].content, cur.messages.at(-1)!.content)
    } catch (e) {
      update({ error: signal.aborted ? 'aborted' : errorCode(e) }, true)
    } finally {
      if (timer) clearTimeout(timer)
      controller = null; set({ busy: false, status: null })
      const done = { ...cur, updatedAt: Date.now() }; replace(done)
      await putConv(done).catch(() => {})
    }
  }

  return {
    convs: [], activeId: null, draft: null, models: [], modelId: '', modelsState: 'idle', caps: null, busy: false, status: null,
    async init() { void get().loadModels(); try { set({ convs: await listConvs() }) } catch { /* an unreadable database starts empty */ } },
    async loadModels() {
      set({ modelsState: 'loading' })
      try {
        const list = await fetchModels()
        const saved = useSettings.getState().model
        const pick = (cur: string) => (list.some(m => m.id === cur && m.available) ? cur : saved && list.some(m => m.id === saved && m.available) ? saved : (list.find(m => m.access === 'free' && m.available)?.id ?? list.find(m => m.available)?.id ?? ''))
        const modelId = pick(get().modelId)
        set(s => ({ models: list, modelId, modelsState: list.length ? 'ready' : 'error', draft: s.draft ?? (s.activeId ? null : newConv(modelId)) }))
      } catch (e) { set({ modelsState: e instanceof ChatError && e.kind === 'auth' ? 'auth' : 'error' }) }
      fetchCapabilities().then(caps => set({ caps })).catch(() => set({ caps: { files: false, web: true } }))
    },
    selectModel(id) { useSettings.getState().setModel(id); set(s => ({ modelId: id, draft: s.draft && !s.activeId ? { ...s.draft, model: id } : s.draft })) },
    newChat() { if (get().busy) return; set(s => ({ activeId: null, draft: newConv(s.modelId) })) },
    open(id) { if (!get().busy) set({ activeId: id }) },
    async remove(id) {
      await deleteConv(id).catch(() => {})
      set(s => ({ convs: s.convs.filter(c => c.id !== id), ...(s.activeId === id ? { activeId: null, draft: newConv(s.modelId) } : {}) }))
    },
    reset() { controller?.abort(); set({ convs: [], activeId: null, draft: null, models: [], modelId: '', modelsState: 'idle', caps: null, busy: false, status: null }) },
    async send(text, opts) {
      const s = get(), conv = currentConv(s), body = text.trim()
      if (s.busy || !conv || !body || !s.models.length) return
      const user: Msg = { id: newId(), role: 'user', content: body, createdAt: Date.now() }
      await run({ ...conv, web: opts.web, title: conv.title || titleFrom(body) }, [...conv.messages, user], opts)
    },
    async regenerate(opts) {
      const s = get(), conv = currentConv(s); if (s.busy || !conv) return
      const msgs = [...conv.messages]; while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop()
      if (msgs.length) await run(conv, msgs, opts)
    },
    stop() { controller?.abort() },
  }
})
