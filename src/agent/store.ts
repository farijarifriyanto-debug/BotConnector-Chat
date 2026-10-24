// State for one remote agent session (bccli on the user's laptop, driven from the phone).
// Holds the baseline history plus the live event buffer so the UI never re-derives state.
import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import {
  AGENT_IDLE_TIMEOUT_MS,
  type AgentAnswer,
  type AgentFrame,
  type AgentItem,
  type AgentMessage,
  approve as approveRpc,
  cancel as cancelRpc,
  prompt as promptRpc,
  session as sessionRpc,
  stream as streamRpc,
} from './api'

const KEY = 'bc.agent.session.v1'
export const HEARTBEAT_TOLERANCE_MS = AGENT_IDLE_TIMEOUT_MS

export interface ApprovalRequest { requestId: string; tool: string; target?: string; preview?: string; diff?: string }
export interface AgentUsage { inputTokens?: number; outputTokens?: number; [k: string]: unknown }

/** Injectable for tests: the stream generator and the re-baseline call. */
let streamFactory: (deviceId: string, sessionId: string, signal?: AbortSignal) => AsyncGenerator<AgentFrame> = streamRpc
let reloadSession: (deviceId: string, sessionId: string, cwd?: string) => Promise<{ messages: AgentMessage[] }> = sessionRpc
export function configureAgentStore(opts: { stream?: typeof streamFactory; reload?: typeof reloadSession }): void {
  if (opts.stream) streamFactory = opts.stream
  if (opts.reload) reloadSession = opts.reload
}

interface Saved { deviceId: string; sessionId: string; cwd?: string }
const readSaved = (): Saved | null => {
  try {
    const j = JSON.parse(Storage.getItemSync(KEY) ?? 'null')
    return j && typeof j.deviceId === 'string' && typeof j.sessionId === 'string' ? j : null
  } catch {
    return null
  }
}
const writeSaved = (v: Saved | null): void => {
  try {
    if (v) Storage.setItemSync(KEY, JSON.stringify(v))
    else Storage.removeItemSync?.(KEY)
  } catch {
    /* not persisted */
  }
}

interface State {
  deviceId: string | null
  sessionId: string | null
  cwd: string | null
  baseline: AgentMessage[]
  items: AgentItem[]
  pending: ApprovalRequest | null
  turn: 'idle' | 'running'
  usage: AgentUsage | null
  error: string | null
  /** Re-attach after app restart: restores the saved ids without touching the network. */
  restore(): void
  open(deviceId: string, sessionId: string, cwd?: string): Promise<void>
  applyFrame(frame: AgentFrame): void
  send(text: string, signal?: AbortSignal): Promise<void>
  answer(answer: AgentAnswer): Promise<void>
  stop(): Promise<void>
  reset(): void
}

const approvalOf = (item: AgentItem): ApprovalRequest => ({
  requestId: String(item.requestId ?? ''),
  tool: String(item.tool ?? 'tool'),
  target: typeof item.target === 'string' ? item.target : undefined,
  preview: typeof item.preview === 'string' ? item.preview : undefined,
  diff: typeof item.diff === 'string' ? item.diff : undefined,
})

export const useAgent = create<State>((set, get) => ({
  deviceId: null,
  sessionId: null,
  cwd: null,
  baseline: [],
  items: [],
  pending: null,
  turn: 'idle',
  usage: null,
  error: null,

  restore() {
    const saved = readSaved()
    if (saved) set({ deviceId: saved.deviceId, sessionId: saved.sessionId, cwd: saved.cwd ?? null })
  },

  async open(deviceId, sessionId, cwd) {
    set({ deviceId, sessionId, cwd: cwd ?? null, baseline: [], items: [], pending: null, usage: null, error: null, turn: 'idle' })
    writeSaved({ deviceId, sessionId, ...(cwd ? { cwd } : {}) })
    try {
      const full = await reloadSession(deviceId, sessionId, cwd)
      set({ baseline: Array.isArray(full?.messages) ? full.messages : [], cwd: (full as { cwd?: string })?.cwd ?? cwd ?? null })
    } catch (e) {
      set({ error: (e as { code?: string })?.code ?? 'network' })
    }
  },

  applyFrame(frame) {
    if (frame?.heartbeat) return
    if (frame?.done) {
      set({ turn: 'idle' })
      return
    }
    const item = frame?.event
    if (!item) return
    switch (item.type) {
      case 'ready':
        return
      case 'approval_request':
        set({ pending: approvalOf(item), turn: 'running' })
        return
      case 'usage':
        set({ usage: item as unknown as AgentUsage })
        return
      case 'error':
        set({ error: String(item.code ?? 'device_error'), turn: 'idle' })
        return
      case 'result':
        set({ turn: 'idle', pending: null })
        return
      default:
        set({ items: [...get().items, item] })
    }
  },

  async send(text, signal) {
    const { deviceId, sessionId } = get()
    if (!deviceId || !sessionId || !text.trim() || get().turn === 'running') return
    set({ turn: 'running', error: null, items: [], pending: null })
    try {
      await promptRpc(deviceId, sessionId, text.trim(), signal)
    } catch (e) {
      set({ turn: 'idle', error: (e as { code?: string })?.code ?? 'network' })
    }
  },

  async answer(answer) {
    const { deviceId, sessionId, pending } = get()
    if (!deviceId || !sessionId || !pending) return
    set({ pending: null })
    try {
      await approveRpc(deviceId, sessionId, pending.requestId, answer)
    } catch (e) {
      set({ error: (e as { code?: string })?.code ?? 'network' })
    }
  },

  async stop() {
    const { deviceId, sessionId } = get()
    if (!deviceId || !sessionId) return
    try {
      await cancelRpc(deviceId, sessionId)
    } catch (e) {
      set({ error: (e as { code?: string })?.code ?? 'network' })
    }
    set({ turn: 'idle', pending: null })
  },

  reset() {
    writeSaved(null)
    set({ deviceId: null, sessionId: null, cwd: null, baseline: [], items: [], pending: null, turn: 'idle', usage: null, error: null })
  },
}))

/**
 * Consumes the relay stream into the store. Re-baselines and reopens once after a
 * watchdog timeout (120 s without any frame), so a dropped phone connection recovers
 * without losing the pending approval (bccli replays it on reopen).
 */
export async function attachStream(signal?: AbortSignal, maxReconnects = 1): Promise<void> {
  const store = useAgent.getState()
  const { deviceId, sessionId, cwd } = store
  if (!deviceId || !sessionId) return
  let reconnects = 0
  for (;;) {
    try {
      for await (const frame of streamFactory(deviceId, sessionId, signal)) useAgent.getState().applyFrame(frame)
      return
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (signal?.aborted || code === 'aborted') return
      if (code !== 'agent_timeout' || reconnects >= maxReconnects) {
        useAgent.setState({ error: code ?? 'network', turn: 'idle' })
        return
      }
      reconnects += 1
      try {
        const full = await reloadSession(deviceId, sessionId, cwd ?? undefined)
        useAgent.setState({ baseline: Array.isArray(full?.messages) ? full.messages : [], items: [] })
      } catch {
        /* reopen anyway; the stream replays pending approvals */
      }
    }
  }
}
