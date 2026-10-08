// BotConnector Cloud API client (Bearer access token). Same wire contract as the web Chat's lib/api.ts, minus the cookie-only BFF routes.
import { fetch } from 'expo/fetch'
import { API_BASE } from './config'
import { ChatError, type Access, type ChatModel } from '../lib/types'

const JSON_POST = { 'content-type': 'application/json', accept: 'application/json' }

let tokenProvider: () => string | null = () => null
let unauthorizedHandler: () => void = () => {}
/** The auth store registers where the access token comes from and what to do when the server says 401. */
export function configureApi(opts: { token: () => string | null; onUnauthorized: () => void }) { tokenProvider = opts.token; unauthorizedHandler = opts.onUnauthorized }

function retryAfter(v: string | null): number | undefined { const n = Number(v); return v && Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined }

/** Maps Cloud errors to a kind; server text is never shown. */
export function classify(status: number, code: string | undefined, wait?: number): ChatError {
  const o = { status, retryAfterSeconds: wait }
  if (status === 401 || code === 'AUTH_REQUIRED' || code === 'invalid_api_key') return new ChatError('auth', o)
  if (code && /^privacy_/i.test(code)) return new ChatError('privacy', o)
  if (/^payg_balance|payg_balance_or_limit$/i.test(code ?? '') || status === 402) return new ChatError('balance', o)
  if (/free_model_requires_plan/i.test(code ?? '')) return new ChatError('plan', o)
  if (code && /^files_|file_not_ready|file_/.test(code)) return new ChatError('files', o)
  if (status === 413 || /request_too_large/i.test(code ?? '')) return new ChatError('too_large', o)
  if (status === 429) return new ChatError('capacity', o)
  if (status >= 500) return new ChatError('unavailable', o)
  return new ChatError('rejected', o)
}

async function failure(r: Response): Promise<ChatError> {
  let code: string | undefined
  try { const j = await r.json(); code = typeof j?.error?.code === 'string' ? j.error.code : undefined } catch { /* empty body */ }
  const e = classify(r.status, code, retryAfter(r.headers.get('retry-after')))
  if (e.kind === 'auth') unauthorizedHandler()
  return e
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const t = tokenProvider()
  return { ...(t ? { authorization: `Bearer ${t}` } : {}), ...extra }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let r: Response
  try { r = await fetch(`${API_BASE}${path}`, { headers: headers({ accept: 'application/json' }), signal }) } catch { throw new ChatError('network') }
  if (!r.ok) throw await failure(r)
  return (await r.json().catch(() => ({}))) as T
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let r: Response
  try { r = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: headers(JSON_POST), body: JSON.stringify(body), signal }) }
  catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (!r.ok) throw await failure(r)
  return (await r.json().catch(() => ({}))) as T
}

const accessOf = (v: unknown): Access => (v === 'plan' || v === 'payg' || v === 'family' || v === 'auto' ? v : 'free')
export const prettyId = (id: string) => id.replace(/^payg:/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/** Model ids from /v1/models (what this account can use right now) joined with names/capabilities from the catalog. */
export async function fetchModels(): Promise<ChatModel[]> {
  const [models, catalog] = await Promise.all([
    getJson<{ data?: any[] }>('/v1/models'),
    getJson<{ data?: any[] }>('/v1/catalog').catch(() => ({ data: [] as any[] })),
  ])
  const byId = new Map<string, any>((catalog.data ?? []).map(c => [String(c.id), c]))
  const rank: Record<Access, number> = { auto: 0, free: 1, plan: 2, family: 3, payg: 4, custom: 5, local: 6 }
  return (models.data ?? [])
    .filter(m => m && typeof m.id === 'string' && !/image|embed|rerank|speech|audio/i.test(String(m.botconnector_modality ?? '')))
    .map((m): ChatModel => {
      const c = byId.get(String(m.id)); const caps = m.botconnector_capabilities ?? {}, ccaps = c?.capabilities ?? {}
      const toolsFlag = (v: unknown) => v === true || v === 'supported'
      const fund = m.botconnector_funding
      return {
        id: String(m.id), name: String(m.botconnector_name || c?.name || prettyId(String(m.id))), access: accessOf(m.botconnector_access),
        context: typeof m.botconnector_context_limit_tokens === 'number' ? m.botconnector_context_limit_tokens : typeof c?.contextTokens === 'number' ? c.contextTokens : undefined,
        vision: caps.vision === true || ccaps.vision === true, tools: toolsFlag(caps.tools) || toolsFlag(ccaps.tools), reasoning: caps.reasoning === true || ccaps.reasoning === true,
        available: !(fund && fund.available_now === false), reason: typeof fund?.reason === 'string' ? fund.reason : undefined,
      }
    })
    .sort((a, b) => rank[a.access] - rank[b.access] || a.name.localeCompare(b.name))
}

export interface Capabilities { files: boolean; web: boolean; filesReason?: string }
export async function fetchCapabilities(): Promise<Capabilities> {
  const j = await getJson<any>('/v1/client/capabilities')
  return { files: j?.capabilities?.files === true, web: j?.capabilities?.web_search !== false, filesReason: typeof j?.reasons?.files === 'string' ? j.reasons.files : undefined }
}

export interface SearchHit { title: string; url: string; snippet: string }
export async function webSearch(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const j = await postJson<{ results?: any[] }>('/v1/web/search', { query, max_results: 5 }, signal)
  return (j.results ?? []).filter(x => x && typeof x.url === 'string').map(x => ({ title: String(x.title || x.url).slice(0, 200), url: String(x.url), snippet: String(x.snippet || '').slice(0, 700) }))
}
export async function webFetch(url: string, signal?: AbortSignal): Promise<{ title: string; text: string }> {
  const j = await postJson<any>('/v1/web/fetch', { url }, signal)
  return { title: String(j?.title || url).slice(0, 200), text: String(j?.content ?? j?.text ?? j?.markdown ?? '').slice(0, 12000) }
}

// ---------- streaming completions ----------
export interface ToolCallDelta { index: number; id?: string; name?: string; args?: string }
export interface Delta { content?: string; reasoning?: string; toolCalls?: ToolCallDelta[]; finish?: string }

/** Parses one SSE data payload into the parts the UI cares about (OpenAI-compatible chunk). */
export function parseChunk(payload: string): Delta | null {
  let j: any
  try { j = JSON.parse(payload) } catch { return null }
  const choice = j?.choices?.[0]; if (!choice) return null
  const d = choice.delta ?? choice.message ?? {}
  const out: Delta = {}
  if (typeof d.content === 'string' && d.content) out.content = d.content
  const reasoning = d.reasoning_content ?? d.reasoning
  if (typeof reasoning === 'string' && reasoning) out.reasoning = reasoning
  if (Array.isArray(d.tool_calls)) out.toolCalls = d.tool_calls.map((t: any, i: number) => ({ index: Number.isInteger(t?.index) ? t.index : i, id: t?.id, name: t?.function?.name, args: t?.function?.arguments }))
  if (typeof choice.finish_reason === 'string') out.finish = choice.finish_reason
  return out
}

/** Splits an SSE text buffer into complete "data:" payloads; returns the unfinished tail. */
export function drainSse(buf: string): { payloads: string[]; rest: string } {
  const payloads: string[] = []
  let i: number
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const block = buf.slice(0, i); buf = buf.slice(i + 2)
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim(); if (data && data !== '[DONE]') payloads.push(data)
    }
  }
  return { payloads, rest: buf }
}

/** Other transports (custom providers, on-device models) claim a model-id prefix; everything else goes to BotConnector Cloud. */
type Streamer = (body: Record<string, unknown>, signal?: AbortSignal) => AsyncGenerator<Delta>
const streamers: { prefix: string; run: Streamer }[] = []
export const registerStreamer = (prefix: string, run: Streamer) => { if (!streamers.some(s => s.prefix === prefix)) streamers.push({ prefix, run }) }

export async function* streamCompletion(body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<Delta> {
  const other = streamers.find(s => String(body.model ?? '').startsWith(s.prefix))
  if (other) { yield* other.run(body, signal); return }
  let r: Response
  try { r = await fetch(`${API_BASE}/v1/chat/completions`, { method: 'POST', headers: headers({ ...JSON_POST, accept: 'text/event-stream, application/json' }), body: JSON.stringify({ ...body, stream: true }), signal }) }
  catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (!r.ok) throw await failure(r)
  if (!(r.headers.get('content-type') || '').includes('text/event-stream') || !r.body) {   // answered without streaming: one complete message
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
      buf += dec.decode(chunk.value, { stream: true })
      const { payloads, rest } = drainSse(buf); buf = rest
      for (const p of payloads) { const d = parseChunk(p); if (d) yield d }
    }
  } finally { reader.releaseLock?.() }
}
