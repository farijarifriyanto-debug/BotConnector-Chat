// Remote agent sessions (bccli) on the user's paired laptop. Requests go
// account-api -> device relay -> Device CLI -> `bccli serve` (loopback).
// Contract: bccli docs/serve-api.md; relay methods `agent.*`
// (BotConnector-Chat docs/superpowers/specs/2026-10-21-agent-remote-laptop-design.md §5).
import { fetch as expoFetch } from 'expo/fetch'
import { API_BASE } from '../api/config'
import { drainSse } from '../api/api'

const DEVICES = `${API_BASE}/v1/client/devices`
/** Relay/device heartbeats arrive every 25 s; three missed beats means the link is dead. */
export const AGENT_IDLE_TIMEOUT_MS = 120_000

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<any>
let token: () => string | null = () => null
let transport: FetchLike = expoFetch as unknown as FetchLike

/** Wires the account bearer token; tests also inject a fake fetch here. */
export function configureAgent(opts: { token?: () => string | null; fetch?: FetchLike }): void {
  if (opts.token) token = opts.token
  if (opts.fetch) transport = opts.fetch
}

/** Every agent failure carries a `code` the UI can explain (`agent_runtime_missing`, `agent_busy`, `device_offline`, ...). */
export class AgentError extends Error {
  code: string
  status: number
  constructor(code: string, status = 0) {
    super(code)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'AgentError'
    this.code = code
    this.status = status
  }
}

export interface AgentCapabilities { supported: boolean; bccliVersion?: string; deviceCliVersion?: string }
export interface AgentWorkspace { path: string; name?: string; lastUsed?: number }
export interface AgentSessionSummary { id: string; mtime?: number; preview?: string }
export interface AgentMessage { role: string; content?: unknown; [k: string]: unknown }
export interface AgentSession { id: string; cwd: string; permissionMode: string; messages: AgentMessage[] }
/** A bccli serve mux item, passed through unchanged. */
export interface AgentItem { type: string; [k: string]: unknown }
export type AgentFrame = { event?: AgentItem; heartbeat?: true; done?: true; result?: unknown }
export type AgentAnswer = 'yes' | 'no' | 'session'

const headers = (post: boolean): Record<string, string> => {
  const t = token()
  return { accept: 'application/json', ...(post ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) }
}

const codeOf = (status: number, body: any): string => {
  const raw = typeof body?.error?.code === 'string' ? body.error.code.toLowerCase() : ''
  if (raw) return raw
  if (status === 401) return 'auth'
  if (status === 409) return 'agent_busy'
  return 'device_error'
}

async function call<T>(deviceId: string, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  let res: any
  try {
    res = await transport(`${DEVICES}/${encodeURIComponent(deviceId)}/request`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ method, params }),
      signal,
    })
  } catch {
    throw new AgentError('network')
  }
  if (!res.ok) {
    const body = await res.json?.().catch?.(() => ({}))
    throw new AgentError(codeOf(res.status, body ?? {}), res.status)
  }
  const json = (await res.json?.().catch?.(() => ({}))) ?? {}
  if (json?.error) throw new AgentError(codeOf(res.status ?? 0, json))
  return json?.result as T
}

export const capabilities = (deviceId: string, signal?: AbortSignal) => call<AgentCapabilities>(deviceId, 'agent.capabilities', {}, signal)
export const workspaces = (deviceId: string, signal?: AbortSignal) => call<AgentWorkspace[]>(deviceId, 'agent.workspaces', {}, signal)
export const sessions = async (deviceId: string, cwd?: string, signal?: AbortSignal) =>
  (await call<unknown>(deviceId, 'agent.sessions', cwd ? { cwd } : {}, signal)) as AgentSessionSummary[]
export const session = (deviceId: string, id: string, cwd?: string, signal?: AbortSignal) =>
  call<AgentSession>(deviceId, 'agent.session', { id, ...(cwd ? { cwd } : {}) }, signal)
export const start = async (deviceId: string, cwd: string, model?: string, signal?: AbortSignal) => {
  const out = await call<{ sessionId?: string; id?: string }>(deviceId, 'agent.start', { cwd, ...(model ? { model } : {}) }, signal)
  const sessionId = out?.sessionId ?? out?.id
  if (!sessionId) throw new AgentError('device_error')
  return sessionId
}
export const prompt = async (deviceId: string, sessionId: string, text: string, signal?: AbortSignal) => {
  const out = await call<{ turnId?: string }>(deviceId, 'agent.prompt', { sessionId, prompt: text }, signal)
  return out?.turnId
}
export const approve = (deviceId: string, sessionId: string, requestId: string, answer: AgentAnswer, signal?: AbortSignal) =>
  call<{ ok: boolean }>(deviceId, 'agent.approve', { sessionId, requestId, answer }, signal)
export const cancel = (deviceId: string, sessionId: string, signal?: AbortSignal) =>
  call<{ ok: boolean }>(deviceId, 'agent.cancel', { sessionId }, signal)

/**
 * Long-lived mux mirror. Yields relay frames verbatim (`{event}`, `{heartbeat}`, `{done}`).
 * Throws `agent_timeout` when nothing (not even a heartbeat) arrives within
 * AGENT_IDLE_TIMEOUT_MS, so the caller can re-baseline and reopen.
 */
export async function* stream(
  deviceId: string,
  sessionId: string,
  signal?: AbortSignal,
  idleMs = AGENT_IDLE_TIMEOUT_MS,
): AsyncGenerator<AgentFrame> {
  let res: any
  try {
    res = await transport(`${DEVICES}/${encodeURIComponent(deviceId)}/stream`, {
      method: 'POST',
      headers: { ...headers(true), accept: 'text/event-stream' },
      body: JSON.stringify({ method: 'agent.stream', params: { sessionId } }),
      signal,
    })
  } catch {
    throw new AgentError((signal?.aborted && 'aborted') || 'network')
  }
  if (!res.ok || !res.body) throw new AgentError(res.status === 401 ? 'auth' : codeOf(res.status, {}), res.status)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const watchdog = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AgentError('agent_timeout')), idleMs)
      })
      let chunk: { done?: boolean; value?: Uint8Array }
      try {
        chunk = await Promise.race([reader.read(), watchdog])
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (chunk.done) return
      buf += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
      const { payloads, rest } = drainSse(buf)
      buf = rest
      for (const payload of payloads) {
        let frame: AgentFrame
        try {
          frame = JSON.parse(payload) as AgentFrame
        } catch {
          continue
        }
        if (frame?.event?.type === 'error') throw new AgentError(String((frame.event.code as string) ?? 'device_error'))
        yield frame
        if (frame?.done) return
      }
    }
  } catch (error) {
    if (signal?.aborted) throw new AgentError('aborted')
    throw error instanceof AgentError ? error : new AgentError('network')
  } finally {
    try {
      reader.releaseLock?.()
    } catch {
      /* already released */
    }
  }
}
