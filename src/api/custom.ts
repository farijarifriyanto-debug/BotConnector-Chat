// Custom OpenAI-compatible providers. These calls go straight to the provider with the user's own key; the BotConnector token is never sent.
import { fetch } from 'expo/fetch'
import { drainSse, parseChunk, registerStreamer, type Delta } from './api'
import { ChatError } from '../lib/types'

export const CUSTOM_PREFIX = 'custom:'
export const customId = (providerId: string, raw: string) => `${CUSTOM_PREFIX}${providerId}:${raw}`
export function parseCustomId(id: string): { providerId: string; raw: string } | null {
  if (!id.startsWith(CUSTOM_PREFIX)) return null
  const rest = id.slice(CUSTOM_PREFIX.length), i = rest.indexOf(':')
  return i > 0 ? { providerId: rest.slice(0, i), raw: rest.slice(i + 1) } : null
}

export interface Endpoint { baseUrl: string; apiKey: string }
let endpointOf: (providerId: string) => Promise<Endpoint | null> = async () => null
/** The provider store tells this module where a provider's address and key live. */
export const configureEndpoints = (fn: typeof endpointOf) => { endpointOf = fn }

/** Hosts where plain http is acceptable: this phone and the user's own network (Ollama, LM Studio, a home server, Tailscale). */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.ts.net') || h.endsWith('.internal')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/); if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127)
}

export type UrlProblem = 'url' | 'https'
/** Cleans an address typed by the user; returns the base URL without a trailing slash, or why it is not acceptable. */
export function normalizeBaseUrl(input: string): { ok: true; url: string } | { ok: false; problem: UrlProblem } {
  let u: URL
  try { u = new URL(input.trim()) } catch { return { ok: false, problem: 'url' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, problem: 'url' }
  if (u.username || u.password || !u.hostname) return { ok: false, problem: 'url' }
  if (u.protocol === 'http:' && !isPrivateHost(u.hostname)) return { ok: false, problem: 'https' }
  return { ok: true, url: (u.origin + u.pathname).replace(/\/+$/, '') }
}

const authHeader = (key: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {})

function failure(status: number, wait?: number): ChatError {
  const o = { status, retryAfterSeconds: wait }
  if (status === 401 || status === 403) return new ChatError('badkey', o)
  if (status === 402) return new ChatError('balance', o)
  if (status === 413) return new ChatError('too_large', o)
  if (status === 429) return new ChatError('capacity', o)
  if (status >= 500) return new ChatError('unavailable', o)
  return new ChatError('rejected', o)
}
const waitOf = (v: string | null) => { const n = Number(v); return v && Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined }

/** GET {base}/models. OpenAI shape ({data:[{id}]}); also accepts a bare array or Ollama's {models:[{name}]}. */
export async function listRemoteModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<{ id: string; name?: string }[]> {
  let r: Response
  try { r = await fetch(`${baseUrl}/models`, { headers: { accept: 'application/json', ...authHeader(apiKey) }, signal }) } catch { throw new ChatError('network') }
  if (!r.ok) throw failure(r.status, waitOf(r.headers.get('retry-after')))
  const j: any = await r.json().catch(() => null)
  const rows: any[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []
  const seen = new Set<string>()
  return rows.map(x => { const id = String(x?.id ?? x?.name ?? x?.model ?? ''); return { id, name: typeof x?.name === 'string' && x.name !== id ? x.name : undefined } })
    .filter(x => x.id && !seen.has(x.id) && (seen.add(x.id), true)).slice(0, 500)
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function* streamCustom(body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<Delta> {
  const ref = parseCustomId(String(body.model)); const ep = ref ? await endpointOf(ref.providerId) : null
  if (!ref || !ep) throw new ChatError('rejected')
  let r: Response
  try { r = await fetch(`${ep.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json', ...authHeader(ep.apiKey) }, body: JSON.stringify({ ...body, model: ref.raw, stream: true }), signal }) }
  catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (!r.ok) throw failure(r.status, waitOf(r.headers.get('retry-after')))
  if (!(r.headers.get('content-type') || '').includes('text/event-stream') || !r.body) {
    const j = await r.json().catch(() => null); const d = j ? parseChunk(JSON.stringify(j)) : null
    if (d) yield { ...d, finish: d.finish ?? 'stop' }
    return
  }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = ''
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await reader.read() } catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
      if (chunk.done) break
      buf += dec.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
      const { payloads, rest } = drainSse(buf); buf = rest
      for (const p of payloads) { const d = parseChunk(p); if (d) yield d }
    }
  } finally { reader.releaseLock?.() }
}
registerStreamer(CUSTOM_PREFIX, streamCustom)
