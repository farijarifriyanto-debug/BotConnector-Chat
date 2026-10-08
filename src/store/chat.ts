import { create } from 'zustand'
import { fetchCapabilities, fetchImageModels, fetchModels, generateImage, streamCompletion, type Capabilities, type ImageModel } from '../api/api'
import { deleteConv, listConvs, putConv } from '../db/convs'
import { runAssistant } from '../lib/agent'
import { deleteImagesOf, saveImage } from '../lib/images'
import { composedSystem, fileIdsOf, newConv, newId, titleFrom, toApiMessages } from '../lib/conv'
import { research, ResearchError, type Progress } from '../lib/research'
import { ChatError, type Attachment, type ChatModel, type Conv, type Msg } from '../lib/types'
import '../local/engine'
import { localModels, useLocal } from '../local/store'
import { customModels } from './providers'
import { useSettings } from './settings'

const TITLE_PROMPT = 'Write a short title (at most 6 words) for this conversation, in the same language as the user. No quotes, no trailing punctuation. Reply with the title only.'
export interface RunStatus { searching?: string; reading?: string; research?: Progress }
export interface SendOptions { web: boolean; research: boolean; image?: boolean }
type ModelsState = 'idle' | 'loading' | 'ready' | 'error' | 'auth'

interface ChatState {
  convs: Conv[]; activeId: string | null; draft: Conv | null
  models: ChatModel[]; modelId: string; imageModels: ImageModel[]; imageModelId: string; modelsState: ModelsState; caps: Capabilities | null
  busy: boolean; status: RunStatus | null
  init(): Promise<void>; loadModels(): Promise<void>; syncCustom(): void; selectImageModel(id: string): void
  selectModel(id: string): void; newChat(): void; open(id: string): void; remove(id: string): Promise<void>; reset(): void
  send(text: string, opts: SendOptions, attachments?: Attachment[]): Promise<void>; regenerate(opts: SendOptions): Promise<void>; stop(): void
}

let controller: AbortController | null = null

export const currentConv = (s: Pick<ChatState, 'convs' | 'activeId' | 'draft'>): Conv | null => (s.activeId ? s.convs.find(c => c.id === s.activeId) ?? null : s.draft)
const sortConvs = (list: Conv[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)
/** Chats with on-device or custom-provider models are never sent to BotConnector's cloud models (titles, planning). */
const isPrivate = (m: ChatModel) => m.access === 'local' || m.access === 'custom'
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
      if (opts.image) {
        const im = get().imageModels.find(x => x.id === get().imageModelId); if (!im) throw new ChatError('unavailable')
        const g = await generateImage({ model: im.id, prompt: question, size: im.sizes.find(x => x === '1024x1024') ?? undefined }, signal)
        const file = await saveImage(g.b64, g.mime)
        update({ content: '', attachments: [{ kind: 'image', name: 'image', mime: g.mime, size: file.size, uri: file.uri }], image: { prompt: question, modelId: im.id, model: im.name, size: '1024x1024', ...(g.left !== undefined ? { left: String(g.left) } : {}) }, model: im.name, ms: Date.now() - t0 }, true)
      } else if (opts.research && caps?.web !== false) {
        const planner = isPrivate(m) ? m : models.find(x => x.access === 'free' && x.available && !x.reasoning) ?? m   // a local or custom model plans its own research; its questions never go to a cloud model
        const res = await research({ question, history: toApiMessages('', history.slice(0, -1), false), system: composedSystem(base, convs), writer: m, planner, signal,
          onProgress: p => set({ status: { research: p } }), onText: c => update({ content: c }), onReasoning: r => update({ reasoning: r }) })
        update({ content: res.content, reasoning: res.reasoning || undefined, sources: res.sources, searched: res.queries, research: { searches: res.searches, pages: res.pages }, ms: Date.now() - t0 }, true)
      } else {
        const res = await runAssistant({ model: m, messages: toApiMessages(composedSystem(base, convs), history, m.vision), web: opts.web && caps?.web !== false, fileIds: isPrivate(m) ? [] : fileIdsOf(history), signal,
          onText: c => update({ content: c }), onReasoning: r => update({ reasoning: r }), onStatus: s => set({ status: s }) })
        update({ content: res.content, reasoning: res.reasoning || undefined, sources: res.sources.length ? res.sources : undefined, searched: res.queries.length ? res.queries : undefined, ms: Date.now() - t0 }, true)
      }
      const firstQ = history.filter(x => x.role === 'user')
      if (!isPrivate(m) && !base.titled && firstQ.length === 1 && cur.messages.at(-1)?.content && base.title === titleFrom(firstQ[0].content)) void autoTitle(base.id, base.title, firstQ[0].content, cur.messages.at(-1)!.content)
    } catch (e) {
      update({ error: signal.aborted ? 'aborted' : errorCode(e), ...(opts.image ? { image: { prompt: '', modelId: '', model: '', size: '' } } : {}) }, true)   // keeps "regenerate" in image mode
    } finally {
      if (timer) clearTimeout(timer)
      controller = null; set({ busy: false, status: null })
      const done = { ...cur, updatedAt: Date.now() }; replace(done)
      await putConv(done).catch(() => {})
    }
  }

  return {
    convs: [], activeId: null, draft: null, models: [], modelId: '', imageModels: [], imageModelId: '', modelsState: 'idle', caps: null, busy: false, status: null,
    async init() { void get().loadModels(); try { set({ convs: await listConvs() }) } catch { /* an unreadable database starts empty */ } },
    async loadModels() {
      set({ modelsState: 'loading' })
      try {
        const list = [...await fetchModels(), ...customModels(), ...localModels()]
        const saved = useSettings.getState().model
        const pick = (cur: string) => (list.some(m => m.id === cur && m.available) ? cur : saved && list.some(m => m.id === saved && m.available) ? saved : (list.find(m => m.access === 'free' && m.available)?.id ?? list.find(m => m.available)?.id ?? ''))
        const modelId = pick(get().modelId)
        set(s => ({ models: list, modelId, modelsState: list.length ? 'ready' : 'error', draft: s.draft ?? (s.activeId ? null : newConv(modelId)) }))
      } catch (e) { set({ modelsState: e instanceof ChatError && e.kind === 'auth' ? 'auth' : 'error' }) }
      fetchImageModels().then(list => set(s => ({ imageModels: list, imageModelId: list.some(m => m.id === s.imageModelId) ? s.imageModelId : (list.find(m => m.access === 'free')?.id ?? list[0]?.id ?? '') }))).catch(() => {})
      fetchCapabilities().then(caps => set({ caps })).catch(() => set({ caps: { files: false, web: true } }))
    },
    /** Providers were added, refreshed or removed: swap their models in the picker without asking the cloud again. */
    syncCustom() {
      set(s => {
        const models = [...s.models.filter(m => m.access !== 'custom' && m.access !== 'local'), ...customModels(), ...localModels()]
        const modelId = models.some(m => m.id === s.modelId && m.available) ? s.modelId : (models.find(m => m.access === 'free' && m.available)?.id ?? models.find(m => m.available)?.id ?? '')
        return { models, modelId, draft: s.draft && !s.activeId ? { ...s.draft, model: modelId } : s.draft }
      })
    },
    selectImageModel(id) { set({ imageModelId: id }) },
    selectModel(id) { useSettings.getState().setModel(id); set(s => ({ modelId: id, draft: s.draft && !s.activeId ? { ...s.draft, model: id } : s.draft })) },
    newChat() { if (get().busy) return; set(s => ({ activeId: null, draft: newConv(s.modelId) })) },
    open(id) { if (!get().busy) set({ activeId: id }) },
    async remove(id) {
      await deleteImagesOf(get().convs.find(c => c.id === id)?.messages ?? [])
      await deleteConv(id).catch(() => {})
      set(s => ({ convs: s.convs.filter(c => c.id !== id), ...(s.activeId === id ? { activeId: null, draft: newConv(s.modelId) } : {}) }))
    },
    reset() { controller?.abort(); set({ convs: [], activeId: null, draft: null, models: [], imageModels: [], imageModelId: '', modelId: '', modelsState: 'idle', caps: null, busy: false, status: null }) },
    async send(text, opts, attachments = []) {
      const s = get(), conv = currentConv(s), body = text.trim()
      if (s.busy || !conv || !body || !s.models.length) return
      const user: Msg = { id: newId(), role: 'user', content: body, createdAt: Date.now(), ...(attachments.length ? { attachments } : {}) }
      await run({ ...conv, web: opts.web, title: conv.title || titleFrom(body) }, [...conv.messages, user], opts)
    },
    async regenerate(opts) {
      const s = get(), conv = currentConv(s); if (s.busy || !conv) return
      const msgs = [...conv.messages]; const wasImage = !!msgs.at(-1)?.image; while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop()
      if (msgs.length) await run(conv, msgs, wasImage ? { ...opts, image: true } : opts)
    },
    stop() { controller?.abort() },
  }
})

// A model finished downloading (or was deleted): show it in the picker at once.
useLocal.subscribe((s, prev) => { if (s.models !== prev.models) useChat.getState().syncCustom() })
