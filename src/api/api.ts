// BotConnector Cloud API client (Bearer access token). Same wire contract as the web Chat's lib/api.ts, minus the cookie-only BFF routes.
import { PadGuard } from '../lib/pad'
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
  if (/free_model_requires_plan|image_plan_required/i.test(code ?? '')) return new ChatError('plan', o)
  if (/image_quota_reached|free_daily_budget_exhausted/i.test(code ?? '')) return new ChatError('quota', o)
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
  const rank: Record<Access, number> = { auto: 0, free: 1, plan: 2, family: 3, payg: 4, custom: 5, local: 6, laptop: 7 }
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

// ---------- image generation ----------
export interface ImageModel { id: string; name: string; access: Access; sizes: string[]; refs: boolean }
export async function fetchImageModels(): Promise<ImageModel[]> {
  const j = await getJson<{ data?: any[] }>('/v1/media/models')
  return (j.data ?? []).filter(m => m && typeof m.id === 'string' && m.botconnector_modality === 'image')
    .map((m): ImageModel => ({ id: String(m.id), name: String(m.name || prettyId(String(m.id))), access: accessOf(m.botconnector_access), sizes: Array.isArray(m.botconnector_sizes) ? m.botconnector_sizes.filter((x: unknown) => typeof x === 'string') : [], refs: m.supports_reference_images === true }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
export interface GeneratedImage { b64: string; mime: string; left?: number }
/** One picture; the server decides free/plan/PAYG and enforces the quota. */
export async function generateImage(req: { model: string; prompt: string; size?: string; /** data URLs of reference photos (only for models that accept them) */ refs?: string[] }, signal?: AbortSignal): Promise<GeneratedImage> {
  const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), 240_000)
  const onAbort = () => timeout.abort(); signal?.addEventListener('abort', onAbort)
  try {
    const j = await postJson<any>('/v1/images/generations', { model: req.model, prompt: req.prompt, n: 1, size: req.size || '1024x1024', ...(req.refs?.length ? { inputs: { referenceImages: req.refs } } : {}) }, timeout.signal)
    const b64 = j?.data?.[0]?.b64_json
    if (typeof b64 !== 'string' || !b64) throw new ChatError('unavailable')
    const q = j?.botconnector?.image_quota
    return { b64, mime: typeof j?.botconnector?.mime_type === 'string' ? j.botconnector.mime_type : 'image/png', left: typeof q?.remaining === 'number' ? q.remaining : undefined }
  } catch (e) {
    if (e instanceof ChatError && e.kind !== 'aborted') throw e
    throw new ChatError(signal?.aborted ? 'aborted' : e instanceof ChatError ? 'aborted' : 'unavailable')   // our own 4-minute timeout is "unavailable"
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
}

// ---------- usage ----------
export type WindowKey = 'fiveHour' | 'weekly' | 'monthly'
export interface Usage {
  plan: string
  /** plan allowance windows, as the percentage of the allowance used (never money); empty on plans without a fixed allowance */
  windows: Partial<Record<WindowKey, { percent: number; resetsAt: string | null }>>
  payg: { currency: string; balance: number; reserved: number; available: number; monthSpend: number; spendLimit: number | null }
}
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export async function fetchUsage(signal?: AbortSignal): Promise<Usage> {
  const j = await getJson<any>('/v1/usage', signal)
  const windows: Usage['windows'] = {}
  for (const k of ['fiveHour', 'weekly', 'monthly'] as const) { const w = j?.quota?.windows?.[k]; if (w && typeof w === 'object') windows[k] = { percent: Math.max(0, Math.min(100, num(w.used_percent))), resetsAt: typeof w.resets_at === 'string' ? w.resets_at : null } }
  const p = j?.payg ?? {}
  return { plan: typeof j?.plan === 'string' ? j.plan : '', windows, payg: { currency: typeof p.currency === 'string' && p.currency ? p.currency : 'USD', balance: num(p.balance_micros), reserved: num(p.reserved_micros), available: num(p.available_micros), monthSpend: num(p.current_period_spend_micros), spendLimit: typeof p.monthly_spend_limit_micros === 'number' ? p.monthly_spend_limit_micros : null } }
}

export interface Capabilities { files: boolean; web: boolean; filesReason?: string }
export async function fetchCapabilities(): Promise<Capabilities> {
  const j = await getJson<any>('/v1/client/capabilities')
  return { files: j?.capabilities?.files === true, web: j?.capabilities?.web_search !== false, filesReason: typeof j?.reasons?.files === 'string' ? j.reasons.files : undefined }
}

export interface SearchHit { title: string; url: string; snippet: string }
/** Chosen by the app: the user's own search provider (BYOK), or null to use BotConnector Search. */
let byokSearch: (q: string, signal?: AbortSignal) => Promise<SearchHit[] | null> = async () => null
export const configureByokSearch = (fn: typeof byokSearch) => { byokSearch = fn }
export async function webSearch(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const own = await byokSearch(query, signal); if (own) return own
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

/** Applies the padding guard to one parsed chunk in place; true = the model is stuck in blanks, cut the stream. */
export function padGuard(d: Delta, g: { text: PadGuard; thought: PadGuard }): boolean {
  if (d.content !== undefined) { const r = g.text.feed(d.content); if (r.out) d.content = r.out; else delete d.content; if (r.stop) return true }
  if (d.reasoning !== undefined) { const r = g.thought.feed(d.reasoning); if (r.out) d.reasoning = r.out; else delete d.reasoning; if (r.stop) return true }
  return false
}

/** No bytes for this long = the connection is dead (a stalled mobile link never errors by itself); the answer so far is kept. */
export const STREAM_IDLE_MS = 90_000
export function readWithin<T>(read: () => Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms)
    read().then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

export async function* streamCompletion(body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<Delta> {
  const other = streamers.find(s => String(body.model ?? '').startsWith(s.prefix))
  if (other) { yield* other.run(body, signal); return }
  if (/^(custom|local|laptop):/.test(String(body.model ?? ''))) throw new ChatError('rejected')   // never let a private chat fall through to the cloud
  let r: Response
  try { r = await fetch(`${API_BASE}/v1/chat/completions`, { method: 'POST', headers: headers({ ...JSON_POST, accept: 'text/event-stream, application/json' }), body: JSON.stringify({ ...body, stream: true }), signal }) }
  catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (!r.ok) throw await failure(r)
  if (!(r.headers.get('content-type') || '').includes('text/event-stream') || !r.body) {   // answered without streaming: one complete message
    const j = await r.json().catch(() => null); const d = j ? parseChunk(JSON.stringify(j)) : null
    if (d) yield { ...d, finish: d.finish ?? 'stop' }
    return
  }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = ''; const pads = { text: new PadGuard(), thought: new PadGuard() }
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await readWithin(() => reader.read(), STREAM_IDLE_MS, () => new ChatError('network')) } catch (e) { void reader.cancel?.().catch?.(() => {}); throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : e instanceof ChatError ? e : new ChatError('network') }
      if (chunk.done) break
      buf += dec.decode(chunk.value, { stream: true })
      const { payloads, rest } = drainSse(buf); buf = rest
      for (const p of payloads) {
        const d = parseChunk(p); if (!d) continue
        const stuck = padGuard(d, pads); if (stuck) { void reader.cancel?.().catch?.(() => {}); yield { finish: 'length' }; return }
        if (d.content !== undefined || d.reasoning !== undefined || d.toolCalls || d.finish) yield d
      }
    }
  } finally { try { reader.releaseLock?.() } catch { /* a read was still pending (stalled stream): the reader was cancelled above */ } }
}
