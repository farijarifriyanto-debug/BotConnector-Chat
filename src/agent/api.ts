// Thin wrappers over the relay's /v1/client/devices/{id}/request|stream endpoints for the nine
// agent.* methods. Transport, auth and error-code mapping live in ../laptop/api (shared with
// laptop chat); this module only names the methods and owns the SSE reader + idle watchdog.
import { drainSse } from '../api/api'
import { deviceRequest, deviceStream, LaptopError } from '../laptop/api'
import type { AgentBaseline, AgentFrame, AgentSessionSummary, AgentWorkspace } from './types'

export const DEFAULT_IDLE_MS = 120_000

export async function agentCapabilities(deviceId: string, signal?: AbortSignal) {
  return deviceRequest<{ supported: boolean; deviceCliVersion?: string; bccliVersion?: string | null }>(deviceId, 'agent.capabilities', {}, signal)
}

export async function agentWorkspaces(deviceId: string, signal?: AbortSignal): Promise<AgentWorkspace[]> {
  const rows = await deviceRequest<AgentWorkspace[]>(deviceId, 'agent.workspaces', {}, signal)
  return Array.isArray(rows) ? rows.filter(r => r && typeof r.path === 'string') : []
}

export async function agentSessions(deviceId: string, cwd: string | null, signal?: AbortSignal): Promise<AgentSessionSummary[]> {
  const rows = await deviceRequest<AgentSessionSummary[]>(deviceId, 'agent.sessions', cwd ? { cwd } : {}, signal)
  return Array.isArray(rows) ? rows.filter(r => r && typeof r.id === 'string') : []
}

export async function agentSession(deviceId: string, id: string, cwd: string | null, signal?: AbortSignal): Promise<AgentBaseline> {
  const base = await deviceRequest<AgentBaseline>(deviceId, 'agent.session', { id, ...(cwd ? { cwd } : {}) }, signal)
  return { ...(base ?? { id }), id: String(base?.id ?? id) }
}

export async function agentStart(deviceId: string, cwd: string): Promise<{ sessionId: string }> {
  const out = await deviceRequest<{ sessionId?: string }>(deviceId, 'agent.start', { cwd })
  if (!out?.sessionId) throw new LaptopError('agent_runtime_missing')
  return { sessionId: String(out.sessionId) }
}

export async function agentPrompt(deviceId: string, sessionId: string, prompt: string): Promise<{ turnId: string | null }> {
  const out = await deviceRequest<{ turnId?: string | null }>(deviceId, 'agent.prompt', { sessionId, prompt })
  return { turnId: out?.turnId ? String(out.turnId) : null }
}

export async function agentApprove(deviceId: string, sessionId: string, requestId: string, answer: 'yes' | 'no' | 'session'): Promise<void> {
  await deviceRequest(deviceId, 'agent.approve', { sessionId, requestId, answer })
}

export async function agentCancel(deviceId: string, sessionId: string): Promise<void> {
  await deviceRequest(deviceId, 'agent.cancel', { sessionId })
}

/**
 * Reads one `agent.stream` SSE response. The watchdog aborts the request when no chunk has arrived
 * for `idleMs` (the bridge sends a heartbeat every 25 s, so a longer silence means the link is dead).
 * A caller abort stops the generator quietly; a watchdog abort throws `LaptopError('stalled')` so the
 * store knows to reload the baseline and reconnect.
 */
export async function* readAgentStream(deviceId: string, sessionId: string, signal?: AbortSignal, idleMs: number = DEFAULT_IDLE_MS): AsyncGenerator<AgentFrame> {
  const ctrl = new AbortController()
  let stalled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const onCallerAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onCallerAbort, { once: true })
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { stalled = true; ctrl.abort() }, idleMs)
  }
  try {
    arm()
    let res: Response
    try {
      res = await deviceStream(deviceId, { method: 'agent.stream', params: { sessionId } }, ctrl.signal)
    } catch (e) {
      if (stalled) throw new LaptopError('stalled')
      if (signal?.aborted) return
      throw e
    }
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (e) {
          if (stalled) throw new LaptopError('stalled')
          if (signal?.aborted) return
          throw new LaptopError('network')
        }
        if (chunk.done) return
        arm()
        buf += dec.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
        const { payloads, rest } = drainSse(buf)
        buf = rest
        for (const payload of payloads) {
          let frame: unknown
          try { frame = JSON.parse(payload) } catch { continue }
          if (!frame || typeof frame !== 'object') continue
          yield frame as AgentFrame
          if ((frame as { done?: boolean }).done) return
        }
      }
    } finally {
      reader.releaseLock?.()
    }
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener('abort', onCallerAbort)
    try { ctrl.abort() } catch { /* already closed */ }
  }
}
