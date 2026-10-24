import { create } from 'zustand'
import { fetchCapabilities, fetchImageModels, fetchModels, generateImage, streamCompletion, webFetch, type Capabilities, type ImageModel } from '../api/api'
import { deleteConv, listConvs, putConv } from '../db/convs'
import { noteDeleted, registerReload, scheduleSync, useSync } from '../sync/store'
import { runAssistant, TOOLS } from '../lib/agent'
import { applyOverrides } from '../lib/toolSchema'
import { useToolSchema } from './toolSchema'
import { deleteImagesOf, saveImage } from '../lib/images'
import { defaultSize } from '../lib/modelPicker'
import { MEMORY_ID, composedSystem, fileIdsOf, isChat, newConv, newId, titleFrom, toApiMessages, blankRecord, projectFileIds } from '../lib/conv'
import { research, ResearchError, type Progress } from '../lib/research'
import { buildPrompt, languageName } from '../lib/translate'
import { ChatError, type Attachment, type ChatModel, type Conv, type Msg } from '../lib/types'
import '../local/engine'
import '../laptop/api'
import { laptopModels, useLaptop } from '../laptop/store'
import { localModels, useLocal } from '../local/store'
import { useAuth } from './auth'
import { customModels } from './providers'
import { readByok, useSearch } from './search'
import { instructionBlock } from './instructions'
import { activeBooks } from './worldbook'
import { activatedEntries, applyLore } from '../lib/worldbook'
import Clipboard from 'expo-clipboard'
import * as Speech from 'expo-speech'
import { bcp47 } from '../i18n/langs'
import { DEVICE_TOOLS, MEMORY_TOOLS, runLocalTool, type ChatHit, type LocalContext } from '../lib/tools/local'

/** Memory, clipboard and time reach the phone through this, so the tool code never imports a store. */
const localContext: LocalContext = {
  memory: () => useChat.getState().convs.find(c => c.id === MEMORY_ID)?.memory ?? [],
  saveMemory: next => useChat.getState().saveMemory({ memory: next }),
  speak: text => Speech.speak(text, { language: bcp47(useSettings.getState().lang) }),
  searchChats: (query, limit, only) => {
    const { convs, activeId } = useChat.getState()
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!keywords.length) return []
    const hits: ChatHit[] = []
    for (const c of convs) {
      if (!isChat(c)) continue
      if (only ? c.id !== only : c.id === activeId) continue
      const snippets: string[] = []
      for (const m of c.messages) {
        const text = m.content ?? '', low = text.toLowerCase()
        if (!keywords.every(k => low.includes(k))) continue
        const at = low.indexOf(keywords[0])
        snippets.push(text.slice(Math.max(0, at - 80), Math.min(text.length, at + 160)).replace(/\s+/g, ' ').trim())
        if (snippets.length >= 3) break
      }
      if (snippets.length) hits.push({ conversationId: c.id, title: c.title, updatedAt: c.updatedAt, snippets })
    }
    return hits.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
  },
  clipboardRead: () => Clipboard.getStringAsync(),
  clipboardWrite: async text => { await Clipboard.setStringAsync(text)  },
}
import { useSettings } from './settings'

const TITLE_PROMPT = 'Write a short title (at most 6 words) for this conversation, in the same language as the user. No quotes, no trailing punctuation. Reply with the title only.'
export interface RunStatus { searching?: string; reading?: string; research?: Progress }
export interface SendOptions { web: boolean; research: boolean; image?: boolean; /** false = ask the model not to reason (sent as reasoning_effort: none) */ think?: boolean; /** picture size the user chose in the Image Studio (must be one the model offers) */ size?: string }
type ModelsState = 'idle' | 'loading' | 'ready' | 'error' | 'auth'

interface ChatState {
  convs: Conv[]; activeId: string | null; draft: Conv | null
  models: ChatModel[]; modelId: string; imageModels: ImageModel[]; imageModelId: string; modelsState: ModelsState; caps: Capabilities | null
  busy: boolean; status: RunStatus | null
  /** a message typed while an answer was still streaming; sent as soon as it ends */
  queued: { text: string; opts: SendOptions; attachments: Attachment[] } | null
  init(): Promise<void>; loadModels(): Promise<void>; syncCustom(): void; selectImageModel(id: string): void
  startWith(system: string): void
  updateConv(id: string, patch: Partial<Pick<Conv, 'title' | 'system' | 'pinned'>>): Promise<void>
  saveMemory(patch: Partial<Pick<Conv, 'system' | 'memory' | 'useMemory'>>): Promise<void>
  /** removes one made picture (its file, the answer and the request that asked for it); an emptied chat goes away too */
  deletePicture(convId: string, msgId: string): Promise<void>
  selectModel(id: string): void; newChat(): void; open(id: string): void; remove(id: string): Promise<void>; reset(): void
  send(text: string, opts: SendOptions, attachments?: Attachment[]): Promise<void>; regenerate(opts: SendOptions): Promise<void>; stop(): void
  queue(text: string, opts: SendOptions, attachments?: Attachment[]): void; cancelQueued(): void
  /** writes a translation of one answer beside it (the original is untouched); '' while it streams */
  translateMessage(msgId: string, code: string): Promise<{ ok: true } | { ok: false; kind: string }>
  clearTranslation(msgId: string): void
  /** project records: a name, its own instructions and documents every bound chat can use */
  createProject(name: string): string
  updateProject(id: string, patch: Partial<Pick<Conv, 'title' | 'system' | 'files'>>): Promise<void>
  removeProject(id: string): Promise<void>
  /** attaches (or detaches, with null) one chat to a project */
  bindProject(chatId: string, projectId: string | null): Promise<void>
}

let controller: AbortController | null = null
/** one translation run at a time per message, like the reference app's run token */
const translations = new Map<string, AbortController>()

export const currentConv = (s: Pick<ChatState, 'convs' | 'activeId' | 'draft'>): Conv | null => (s.activeId ? s.convs.find(c => c.id === s.activeId) ?? null : s.draft)
const sortConvs = (list: Conv[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)
/** Chats with on-device or custom-provider models are never sent to BotConnector's cloud models (titles, planning). */
const isPrivate = (m: ChatModel) => m.access === 'local' || m.access === 'custom' || m.access === 'laptop'
const errorCode = (e: unknown) => {
  if (e instanceof ResearchError) return 'research:' + e.code
  const err = e instanceof ChatError ? e : new ChatError('network')
  return err.kind + (err.retryAfterSeconds ? ':' + err.retryAfterSeconds : '')
}

export const useChat = create<ChatState>((set, get) => {
  const put = (c: Conv) => { set(s => ({ convs: sortConvs([c, ...s.convs.filter(x => x.id !== c.id)]), activeId: c.id, draft: s.draft?.id === c.id ? null : s.draft })) }
  const replace = (c: Conv) => set(s => ({ convs: s.convs.map(x => (x.id === c.id ? c : x)) }))
  /** Writes (or clears, with undefined) the translation of one message wherever that message lives. */
  const setTranslation = (msgId: string, translation?: string) => {
    const s = get()
    const touch = (c: Conv): Conv | null => (c.messages.some(m => m.id === msgId) ? { ...c, messages: c.messages.map(m => (m.id === msgId ? { ...m, translation } : m)), updatedAt: Date.now() } : null)
    let changed: Conv | null = null
    const convs = s.convs.map(c => { const n = touch(c); if (n) changed = n; return n ?? c })
    let draft = s.draft
    if (!changed && draft) { const n = touch(draft); if (n) { changed = n; draft = n } }
    set({ convs, draft })
    if (changed) void putConv(changed).catch(() => {})
  }

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
    let cur: Conv = { ...base, model: m.id, ...(base.local || isPrivate(m) ? { local: true } : {}), messages: [...history, { id: aId, role: 'assistant', content: '', createdAt: Date.now(), model: m.name }], updatedAt: Date.now() }
    controller = new AbortController(); const signal = controller.signal
    set({ busy: true, status: null }); put(cur)
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => { timer = null; replace(cur) }
    const update = (patch: Partial<Msg>, now = false) => {
      cur = { ...cur, messages: cur.messages.map(x => (x.id === aId ? { ...x, ...patch } : x)) }
      if (now) { if (timer) clearTimeout(timer); flush() } else if (!timer) timer = setTimeout(flush, 60)   // at most ~16 repaints a second while streaming
    }
    // "Thought for 5.2s": the clock starts at the first reasoning token and stops as soon as the answer text begins.
    let reasoningAt = 0, reasoningMs = 0
    const noteReasoning = (r: string) => {
      if (!reasoningAt) { reasoningAt = Date.now(); update({ reasoning: r, reasoningAt }) } else update({ reasoning: r })
    }
    const noteText = (c: string) => {
      if (reasoningAt && !reasoningMs && c) { reasoningMs = Math.max(1, Date.now() - reasoningAt); update({ reasoningMs }) }
      update({ content: c })
    }
    try {
      const question = [...history].reverse().find(x => x.role === 'user')?.content.trim() ?? ''
      if (opts.image) {
        const im = get().imageModels.find(x => x.id === get().imageModelId); if (!im) throw new ChatError('unavailable')
        const size = (opts.size && im.sizes.includes(opts.size) ? opts.size : defaultSize(im.sizes)) ?? '1024x1024'
        const refs = im.refs ? [...history].reverse().find(x => x.role === 'user')?.attachments?.filter(a => a.kind === 'image' && a.dataUrl).map(a => a.dataUrl!) : undefined   // photos the user attached in the Studio: "edit" starts from them
        const g = await generateImage({ model: im.id, prompt: question, size, refs }, signal)
        const file = await saveImage(g.b64, g.mime)
        update({ content: '', attachments: [{ kind: 'image', name: 'image', mime: g.mime, size: file.size, uri: file.uri }], image: { prompt: question, modelId: im.id, model: im.name, size, ...(g.left !== undefined ? { left: String(g.left) } : {}) }, model: im.name, ms: Date.now() - t0 }, true)
      } else if (opts.research && caps?.web !== false) {
        const planner = isPrivate(m) ? m : models.find(x => x.access === 'free' && x.available && !x.reasoning) ?? m   // a local or custom model plans its own research; its questions never go to a cloud model
        const res = await research({ question, history: toApiMessages('', history.slice(0, -1), false), system: composedSystem(base, convs, instructionBlock()), writer: m, planner, signal,
          onProgress: p => set({ status: { research: p } }), onText: c => noteText(c), onReasoning: r => noteReasoning(r) })
        update({ content: res.content, reasoning: res.reasoning || undefined, sources: res.sources, searched: res.queries, research: { searches: res.searches, pages: res.pages }, ms: Date.now() - t0 }, true)
      } else {
        const messages = toApiMessages(composedSystem(base, convs, instructionBlock()), history, m.vision)
        const webOn = opts.web && caps?.web !== false
        const settings = useSettings.getState(), overrides = useToolSchema.getState().tools
        const fetchMode = useSearch.getState().webFetch
        const tools = [
          ...(webOn ? applyOverrides(TOOLS, overrides) : []),
          ...(settings.toolsMemory ? applyOverrides(MEMORY_TOOLS.filter(d => d.function.name !== 'chat_search'), overrides) : []),
          ...(settings.toolsRecall ? applyOverrides(MEMORY_TOOLS.filter(d => d.function.name === 'chat_search'), overrides) : []),
          ...(settings.toolsDevice ? applyOverrides(DEVICE_TOOLS, overrides) : []),
        ]
        const res = await runAssistant({ model: m, messages: applyLore(messages, activatedEntries(activeBooks(), messages)), tools, onTool: (name, args) => runLocalTool(name, args, localContext), web: webOn, think: opts.think !== false, fileIds: isPrivate(m) ? [] : fileIdsOf(history, projectFileIds(base, convs)), signal,
          fetchMode,
          fetchPage: fetchMode === 'follow' ? async (url, signal) => (await readByok(url, signal)) ?? webFetch(url, signal) : webFetch,
          onText: c => noteText(c), onReasoning: r => noteReasoning(r), onStatus: s => set({ status: s }) })
        update({ content: res.content, reasoning: res.reasoning || undefined, sources: res.sources.length ? res.sources : undefined, searched: res.queries.length ? res.queries : undefined, ms: Date.now() - t0,
          ...(res.usage ? { promptTokens: res.usage.input, completionTokens: res.usage.output, ...(res.usage.cached ? { cachedTokens: res.usage.cached } : {}), totalTokens: res.usage.total } : {}),
          ...(res.cost ? { costMicros: res.cost.micros, costCurrency: res.cost.currency } : {}) }, true)
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
      scheduleSync()
      // A message typed while this answer was streaming goes out now, once, and never after a stop.
      const waiting = get().queued
      if (waiting && !signal.aborted) { set({ queued: null }); void get().send(waiting.text, waiting.opts, waiting.attachments) }
    }
  }

  return {
    convs: [], activeId: null, draft: null, models: [], modelId: '', imageModels: [], imageModelId: '', modelsState: 'idle', caps: null, busy: false, status: null, queued: null,
    async init() { void useSearch.getState().load(); registerReload(async () => { if (!get().busy) set({ convs: sortConvs(await listConvs()) }) }); scheduleSync(800); void get().loadModels(); if (useAuth.getState().session) void useLaptop.getState().refresh(); try { set({ convs: await listConvs() }) } catch { /* an unreadable database starts empty */ } },
    async loadModels() {
      if (!useAuth.getState().session) {   // no BotConnector account: only the user's own providers and on-device models; nothing is asked from BotConnector
        const list = [...customModels(), ...localModels()]
        set(st => { const modelId = list.some(m => m.id === st.modelId) ? st.modelId : (list.find(m => m.id === useSettings.getState().model)?.id ?? list[0]?.id ?? ''); return { models: list, imageModels: [], imageModelId: '', modelId, modelsState: 'ready', caps: { files: false, web: true }, draft: st.draft ?? (st.activeId ? null : newConv(modelId)) } })
        return
      }
      set({ modelsState: 'loading' })
      try {
        const list = [...await fetchModels(), ...customModels(), ...localModels(), ...laptopModels()]
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
        const models = [...s.models.filter(m => m.access !== 'custom' && m.access !== 'local' && m.access !== 'laptop'), ...customModels(), ...localModels(), ...laptopModels()]
        const modelId = models.some(m => m.id === s.modelId && m.available) ? s.modelId : (models.find(m => m.access === 'free' && m.available)?.id ?? models.find(m => m.available)?.id ?? '')
        return { models, modelId, draft: s.draft && !s.activeId ? { ...s.draft, model: modelId } : s.draft }
      })
    },
    selectImageModel(id) { set({ imageModelId: id }) },
    /** New chat that already carries an assistant's instructions. */
    startWith(system) { if (get().busy) return; set(s => ({ activeId: null, draft: { ...newConv(s.modelId), system } })) },
    async updateConv(id, patch) {
      const s = get(), saved = s.convs.find(c => c.id === id)
      if (saved) { const next = { ...saved, ...patch, ...(patch.title !== undefined ? { titled: true } : {}) }; replace(next); await putConv(next).catch(() => {}); return }
      if (s.draft?.id === id) set({ draft: { ...s.draft, ...patch } })
    },
    async saveMemory(patch) {
      const cur = get().convs.find(c => c.id === MEMORY_ID) ?? { ...newConv(''), id: MEMORY_ID, kind: 'memory' as const }
      const next = { ...cur, ...patch, updatedAt: Date.now() }
      set(s => ({ convs: sortConvs([next, ...s.convs.filter(c => c.id !== MEMORY_ID)]) }))   // not "put": this record must never become the open chat
      await putConv(next).catch(() => {})
    },
    selectModel(id) {
      useSettings.getState().setModel(id)
      const open = get().activeId
      set(s => ({
        modelId: id,
        draft: s.draft && !s.activeId ? { ...s.draft, model: id } : s.draft,
        // the chat itself remembers the choice, so the header, the model button and the next request agree
        convs: open ? s.convs.map(c => (c.id === open ? { ...c, model: id, updatedAt: Date.now() } : c)) : s.convs,
      }))
      const conv = open ? get().convs.find(c => c.id === open) : null
      if (conv) void putConv(conv).catch(() => {})
    },
    newChat() { if (get().busy) return; set(s => ({ activeId: null, draft: newConv(s.modelId) })) },
    open(id) { if (!get().busy) { const conv = get().convs.find(c => c.id === id); set({ activeId: id, ...(conv?.model ? { modelId: conv.model } : {}) }) } },
    async remove(id) {
      await deleteImagesOf(get().convs.find(c => c.id === id)?.messages ?? [])
      await deleteConv(id).catch(() => {}); noteDeleted(id)
      set(s => ({ convs: s.convs.filter(c => c.id !== id), ...(s.activeId === id ? { activeId: null, draft: newConv(s.modelId) } : {}) }))
    },
    reset() { controller?.abort(); useLaptop.getState().clear(); void useSync.getState().disable(false); set({ convs: [], activeId: null, draft: null, models: [], imageModels: [], imageModelId: '', modelId: '', modelsState: 'idle', caps: null, busy: false, status: null }) },
    async send(text, opts, attachments = []) {
      const s = get(), conv = currentConv(s), body = text.trim()
      if (s.busy || !conv || !body || !s.models.length) return
      const user: Msg = { id: newId(), role: 'user', content: body, createdAt: Date.now(), ...(attachments.length ? { attachments } : {}) }
      await run({ ...conv, web: opts.web, title: conv.title || titleFrom(body) }, [...conv.messages, user], opts)
    },
    async regenerate(opts) {
      const s = get(), conv = currentConv(s); if (s.busy || !conv) return
      const msgs = [...conv.messages]; const prev = msgs.at(-1)?.image; while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop()
      if (msgs.length) await run(conv, msgs, prev ? { ...opts, image: true, size: prev.size || opts.size } : opts)   // same kind of picture and size as the one being redone
    },
    async deletePicture(convId, msgId) {
      const conv = get().convs.find(c => c.id === convId); if (get().busy || !conv) return
      const at = conv.messages.findIndex(m => m.id === msgId); const msg = conv.messages[at]
      if (!msg || msg.role !== 'assistant' || !msg.attachments?.some(a => a.kind === 'image' && a.uri)) return   // only a picture answer can be deleted here
      await deleteImagesOf([msg])
      const drop = new Set([msgId]); const before = conv.messages[at - 1]; if (before?.role === 'user') drop.add(before.id)   // the request that asked for it
      const messages = conv.messages.filter(m => !drop.has(m.id))
      if (!messages.length) { await get().remove(convId); return }
      const next = { ...conv, messages, updatedAt: Date.now() }; replace(next); await putConv(next).catch(() => {}); scheduleSync()
    },
    stop() { controller?.abort() },
    queue(text, opts, attachments) { if (get().busy) set({ queued: { text, opts, attachments: attachments ?? [] } }) },
    cancelQueued() { set({ queued: null }) },
    async translateMessage(msgId, code) {
      const s = get(), conv = currentConv(s), msg = conv?.messages.find(m => m.id === msgId)
      if (!conv || !msg || !msg.content.trim()) return { ok: false as const, kind: 'unavailable' }
      const model = s.models.find(x => x.id === conv.model) ?? s.models.find(x => x.id === s.modelId)
      translations.get(msgId)?.abort()
      const ctrl = new AbortController(); translations.set(msgId, ctrl)
      setTranslation(msgId, '')   // the card says "Translating…" until the first words arrive
      let out = ''
      try {
        for await (const d of streamCompletion({ model: model?.id ?? conv.model, messages: [{ role: 'user', content: buildPrompt('', languageName(code), msg.content) }], reasoning_effort: 'none' }, ctrl.signal)) {
          if (d.content) { out += d.content; setTranslation(msgId, out) }
        }
        const done = out.trim()
        setTranslation(msgId, done || undefined)
        return done ? { ok: true as const } : { ok: false as const, kind: 'unavailable' }
      } catch (e) {
        if (ctrl.signal.aborted) return { ok: false as const, kind: 'aborted' }
        setTranslation(msgId, undefined)
        return { ok: false as const, kind: e instanceof ChatError ? e.kind : 'network' }
      } finally {
        if (translations.get(msgId) === ctrl) translations.delete(msgId)
      }
    },
    clearTranslation(msgId) {
      translations.get(msgId)?.abort(); translations.delete(msgId)
      setTranslation(msgId, undefined)
    },
    createProject(name) {
      const rec: Conv = { ...blankRecord('project', newId(), name.trim().slice(0, 80)), files: [] }
      set(s => ({ convs: sortConvs([rec, ...s.convs]) }))
      void putConv(rec).catch(() => {})
      return rec.id
    },
    async updateProject(id, patch) {
      const cur = get().convs.find(c => c.id === id && c.kind === 'project')
      if (!cur) return
      const next = { ...cur, ...patch, updatedAt: Date.now() }
      replace(next)
      await putConv(next).catch(() => {})
    },
    async removeProject(id) {
      const cur = get().convs.find(c => c.id === id && c.kind === 'project')
      if (!cur) return
      await deleteConv(id).catch(() => {})
      set(s => ({ convs: s.convs.filter(c => c.id !== id) }))   // chats keep a dangling id and simply lose the files, like the reference app
    },
    async bindProject(chatId, projectId) {
      const s = get(), conv = s.convs.find(c => c.id === chatId) ?? (s.draft?.id === chatId ? s.draft : null)
      if (!conv) return
      const next: Conv = { ...conv, projectId: projectId ?? undefined, updatedAt: Date.now() }
      if (s.draft?.id === chatId) { set({ draft: next }); return }
      replace(next)
      await putConv(next).catch(() => {})
    },
  }
})

// A model finished downloading (or was deleted): show it in the picker at once.
useLocal.subscribe((s, prev) => { if (s.models !== prev.models) useChat.getState().syncCustom() })
useLaptop.subscribe((s, prev) => { if (s.entries !== prev.entries) useChat.getState().syncCustom() })
// Signing in or out changes which models exist.
useAuth.subscribe((s, prev) => { if (s.status !== prev.status && (s.status === 'signedIn' || s.status === 'guest')) { useChat.getState().loadModels(); if (s.session) void useLaptop.getState().refresh() } })
