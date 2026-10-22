import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { agentApprove, agentCancel, agentPrompt, agentSession, agentStart, readAgentStream } from './api'
import { appendUser, baselineToView, emptyView, reduceFrame } from './reduce'
import type { AgentApprovalAnswer, AgentView } from './types'

export const AGENT_SESSION_KEY = 'bc.agent.session.v1'
const RECONNECT_MS = 1_500
const MAX_FAILURES = 3
const ATTACH_WAIT_MS = 2_000

interface Target { deviceId: string; sessionId: string; cwd: string | null }
export type AgentSheetState = 'closed' | 'picker' | 'session'

interface AgentState {
  deviceId: string | null
  sessionId: string | null
  cwd: string | null
  view: AgentView
  attached: boolean
  busy: boolean
  /** which agent sheet the root renders; a notification tap can open 'session' from anywhere */
  sheet: AgentSheetState
  /** last session this device remembered, offered as `continue` in the picker */
  resume: Target | null
  /** an approval arrived while the session sheet was closed */
  attention: boolean
  attach(deviceId: string, sessionId: string, cwd?: string | null): Promise<void>
  start(deviceId: string, cwd: string): Promise<string>
  send(text: string): Promise<boolean>
  approve(answer: AgentApprovalAnswer): Promise<void>
  cancelTurn(): Promise<void>
  detach(): void
  restore(): Promise<void>
  openPicker(): void
  openSession(target: Target): Promise<void>
  closeSheet(): void
}

let run = 0
let controller: AbortController | null = null
let notifiedRequestId: string | null = null
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const stopLoop = () => { run += 1; try { controller?.abort() } catch { /* already closed */ } controller = null }
const codeOf = (error: unknown): string => {
  const code = (error as { code?: string })?.code
  return typeof code === 'string' && code ? code : 'unavailable'
}

function readPersisted(): Target | null {
  try {
    const raw = Storage.getItemSync(AGENT_SESSION_KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    if (!j || typeof j.deviceId !== 'string' || typeof j.sessionId !== 'string') return null
    return { deviceId: j.deviceId, sessionId: j.sessionId, cwd: typeof j.cwd === 'string' ? j.cwd : null }
  } catch { return null }
}

function persist(target: Target | null) {
  try {
    if (target) Storage.setItemSync(AGENT_SESSION_KEY, JSON.stringify(target))
    else Storage.setItemSync(AGENT_SESSION_KEY, '')
  } catch { /* storage is best-effort; the session still works for this run */ }
}

/** Loads the baseline, then keeps one stream open; on a drop it reloads the baseline and reconnects. */
async function loop(get: () => AgentState, set: (partial: Partial<AgentState> | ((s: AgentState) => Partial<AgentState>)) => void, target: Target, onFirstFrame?: () => void) {
  const token = ++run
  const ctrl = new AbortController()
  controller = ctrl
  let failures = 0
  let firstFrameDone = false
  const markFirstFrame = () => { if (!firstFrameDone) { firstFrameDone = true; onFirstFrame?.() } }

  for (;;) {
    if (token !== run) return
    try {
      const baseline = await agentSession(target.deviceId, target.sessionId, target.cwd, ctrl.signal)
      if (token !== run) return
      set({ view: baselineToView(baseline) })
      for await (const frame of readAgentStream(target.deviceId, target.sessionId, ctrl.signal)) {
        if (token !== run) return
        failures = 0
        set((s: AgentState) => ({ view: reduceFrame(s.view, frame) }))
        const pending = get().view.pending
        if (pending && pending.requestId !== notifiedRequestId) {
          notifiedRequestId = pending.requestId
          // The phone may be on another screen: flag it so the root shows an attention banner.
          if (get().sheet !== 'session') set({ attention: true })
        }
        markFirstFrame()
      }
      if (token !== run) return
      markFirstFrame()
      failures += 1
    } catch (error) {
      if (token !== run || ctrl.signal.aborted) return
      markFirstFrame()
      const code = codeOf(error)
      if (code === 'auth') {
        set((s: AgentState) => ({ view: { ...s.view, error: 'auth' }, attached: false }))
        return
      }
      failures += 1
    }
    if (failures >= MAX_FAILURES) {
      set((s: AgentState) => ({ view: { ...s.view, error: 'unavailable' } }))
      return
    }
    await sleep(RECONNECT_MS)
  }
}

export const useAgent = create<AgentState>((set, get) => ({
  deviceId: null,
  sessionId: null,
  cwd: null,
  view: emptyView,
  attached: false,
  busy: false,
  sheet: 'closed',
  resume: readPersisted(),
  attention: false,

  async attach(deviceId, sessionId, cwd = null) {
    stopLoop()
    set({ deviceId, sessionId, cwd, view: emptyView, attached: true, busy: false, resume: { deviceId, sessionId, cwd } })
    persist({ deviceId, sessionId, cwd })
    await new Promise<void>(resolve => {
      const done = () => resolve()
      const timer = setTimeout(done, ATTACH_WAIT_MS)
      void loop(get, set, { deviceId, sessionId, cwd }, () => { clearTimeout(timer); done() }).catch(() => { clearTimeout(timer); done() })
    })
  },

  async start(deviceId, cwd) {
    const { sessionId } = await agentStart(deviceId, cwd)
    await get().attach(deviceId, sessionId, cwd)
    return sessionId
  },

  async send(text) {
    const { deviceId, sessionId, view } = get()
    const prompt = String(text ?? '').trim()
    if (!deviceId || !sessionId || !prompt) return false
    set({ view: appendUser({ ...view, error: null }, prompt), busy: true })
    try {
      await agentPrompt(deviceId, sessionId, prompt)
      return true
    } catch (error) {
      set((s: AgentState) => ({ view: { ...s.view, entries: s.view.entries.filter(e => !(e.kind === 'user' && e.text === prompt && e.id === `user-${s.view.entries.length - 1}`)), error: codeOf(error) } }))
      return false
    } finally {
      set({ busy: false })
    }
  },

  async approve(answer) {
    const { deviceId, sessionId, view } = get()
    const pending = view.pending
    if (!deviceId || !sessionId || !pending || get().busy) return
    set({ busy: true })
    try {
      await agentApprove(deviceId, sessionId, pending.requestId, answer)
      set((s: AgentState) => ({ view: { ...s.view, pending: null, turn: 'running' }, attention: false }))
    } catch (error) {
      set((s: AgentState) => ({ view: { ...s.view, error: codeOf(error) } }))
    } finally {
      set({ busy: false })
    }
  },

  async cancelTurn() {
    const { deviceId, sessionId, view } = get()
    if (!deviceId || !sessionId) return
    try {
      await agentCancel(deviceId, sessionId)
    } catch (error) {
      set((s: AgentState) => ({ view: { ...s.view, error: codeOf(error) } }))
      return
    }
    set({ view: { ...view, pending: null, turn: 'idle' } })
  },

  detach() {
    stopLoop()
    persist(null)
    set({ deviceId: null, sessionId: null, cwd: null, view: emptyView, attached: false, busy: false })
  },

  async restore() {
    if (get().attached) return
    const target = readPersisted()
    if (!target) return
    await get().attach(target.deviceId, target.sessionId, target.cwd)
  },

  openPicker() {
    set({ sheet: 'picker', resume: readPersisted() })
  },

  async openSession(target) {
    set({ sheet: 'session', attention: false })
    await get().attach(target.deviceId, target.sessionId, target.cwd)
  },

  closeSheet() {
    set({ sheet: 'closed' })
  },
}))
