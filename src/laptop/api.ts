// Local AI on the user's paired laptop (BotConnector Local). Requests go account-api -> device relay -> the laptop; no cloud model is involved.
import { fetch } from 'expo/fetch'
import { API_BASE } from '../api/config'
import { drainSse, registerStreamer, type Delta } from '../api/api'
import { newId } from '../lib/conv'
import { ChatError } from '../lib/types'

export const LAPTOP_PREFIX = 'laptop:'
const DEVICES = `${API_BASE}/v1/client/devices`
let token: () => string | null = () => null
export const configureLaptop = (fn: () => string | null) => { token = fn }

export class LaptopError extends Error { code: string; status: number; constructor(code: string, status = 0) { super(code); Object.setPrototypeOf(this, new.target.prototype); this.name = 'LaptopError'; this.code = code; this.status = status } }
export interface Device { id: string; name: string; online: boolean; platform?: string }
export interface LaptopModel { id: string; name: string; runtime: string; loaded: boolean }
export const laptopId = (deviceId: string, runtime: string, model: string) => `${LAPTOP_PREFIX}${deviceId}:${runtime}:${model}`
export function parseLaptopId(id: string): { deviceId: string; runtime: string; model: string } | null {
  if (!id.startsWith(LAPTOP_PREFIX)) return null
  const m = id.slice(LAPTOP_PREFIX.length).match(/^([^:]+):([^:]+):(.+)$/)
  return m ? { deviceId: m[1], runtime: m[2], model: m[3] } : null
}

const headers = (post: boolean): Record<string, string> => { const t = token(); return { accept: 'application/json', ...(post ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) } }
async function call<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let r: Response
  try { r = await fetch(`${DEVICES}${path}`, { method: init.method ?? 'GET', headers: headers(init.method === 'POST'), body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: init.signal }) }
  catch (e) { throw new LaptopError((e as Error)?.name === 'AbortError' ? 'aborted' : 'network') }
  if (!r.ok) {
    let code = 'device_error'; try { const j = await r.json(); if (typeof j?.error?.code === 'string') code = j.error.code.toLowerCase() } catch { /* empty body */ }
    throw new LaptopError(r.status === 401 ? 'auth' : code, r.status)
  }
  return (await r.json().catch(() => ({}))) as T
}
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export async function listDevices(signal?: AbortSignal): Promise<Device[]> {
  const j = await call<{ data?: unknown[] }>('', { signal })
  return (Array.isArray(j.data) ? j.data : []).map((d: any): Device => ({ id: String(d?.id ?? ''), name: str(d?.name) ?? 'Laptop', online: d?.online === true, platform: str(d?.platform) })).filter(d => d.id)
}
export async function createPairCode(): Promise<{ code: string; expiresAt?: number }> {
  const j = await call<{ code?: string; expires_at?: string | number }>('/pair', { method: 'POST', body: {} })
  if (!j.code) throw new LaptopError('device_error')
  const t = typeof j.expires_at === 'number' ? j.expires_at : Date.parse(String(j.expires_at ?? ''))
  return { code: j.code, expiresAt: Number.isFinite(t) ? t : undefined }
}
export const revokeDevice = (id: string) => call(`/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: {} })
async function request<T>(id: string, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  return (await call<{ result?: T }>(`/${encodeURIComponent(id)}/request`, { method: 'POST', body: { method, params }, signal })).result as T
}
export async function listModels(id: string, signal?: AbortSignal): Promise<LaptopModel[]> {
  const [rows, rt] = await Promise.all([request<any[]>(id, 'models.list', {}, signal), request<any>(id, 'runtime.status', {}, signal).catch(() => ({}))])
  const loaded = new Set<string>(rt?.loadedModels ?? (rt?.activeModel ? [rt.activeModel] : []))
  return (Array.isArray(rows) ? rows : []).filter(m => m && (m.id || m.name)).map((m): LaptopModel => { const mid = String(m.id ?? m.name); return { id: mid, name: String(m.name ?? mid), runtime: String(m.runtime ?? 'device'), loaded: loaded.has(mid) } })
}

const deltaOf = (ev: any): string => { const v = ev?.delta ?? ev?.content ?? ev?.text ?? ev?.choices?.[0]?.delta?.content; return typeof v === 'string' ? v : '' }
const textOf = (c: unknown) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => (p?.type === 'text' ? String(p.text ?? '') : '')).join('') : '')
const kindOf = (e: unknown): ChatError => (e instanceof LaptopError ? new ChatError(e.code === 'aborted' ? 'aborted' : e.code === 'auth' ? 'auth' : e.code === 'network' ? 'network' : 'unavailable', { status: e.status }) : new ChatError('unavailable'))

async function* streamLaptop(body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<Delta> {
  const ref = parseLaptopId(String(body.model)); if (!ref) throw new ChatError('rejected')
  const requestId = newId()
  try {
    const found = (await listModels(ref.deviceId, signal)).find(m => m.id === ref.model)
    if (!found) throw new LaptopError('model_missing')
    if (!found.loaded) await request(ref.deviceId, 'model.load', { model: ref.model, runtime: ref.runtime }, signal)   // a big model can take a while
  } catch (e) { throw kindOf(e) }
  const cancel = () => { void request(ref.deviceId, 'chat.cancel', { id: requestId }).catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })
  const messages = (Array.isArray(body.messages) ? body.messages : []).map((m: any) => ({ role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user', content: textOf(m.content) })).filter(m => m.content)
  let r: Response
  try { r = await fetch(`${DEVICES}/${encodeURIComponent(ref.deviceId)}/stream`, { method: 'POST', headers: { ...headers(true), accept: 'text/event-stream' }, signal, body: JSON.stringify({ method: 'chat.completions', params: { model: ref.model, runtime: ref.runtime, messages, request_id: requestId } }) }) }
  catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (!r.ok || !r.body) throw r.status === 401 ? new ChatError('auth') : new ChatError('unavailable', { status: r.status })
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', any = false
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await reader.read() } catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
      if (chunk.done) break
      buf += dec.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
      const { payloads, rest } = drainSse(buf); buf = rest
      for (const p of payloads) {
        let m: any; try { m = JSON.parse(p) } catch { continue }
        if (m?.error) throw new ChatError('unavailable')
        const d = deltaOf(m?.event); if (d) { any = true; yield { content: d } }
        if (m?.done) { const res = m.result?.content ?? m.result?.choices?.[0]?.message?.content; if (!any && typeof res === 'string' && res) { any = true; yield { content: res } }; yield { finish: 'stop' } }
      }
    }
  } finally { reader.releaseLock?.(); signal?.removeEventListener('abort', cancel) }
}
registerStreamer(LAPTOP_PREFIX, streamLaptop)
