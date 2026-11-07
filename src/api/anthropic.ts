// Native Anthropic Messages transport for BYOK Claude providers (QR kind "claude"), the same
// protocol the reference app's ClaudeProvider speaks: {base}/messages, x-api-key, anthropic-version.
// The OpenAI-shaped request the app already builds is translated here; the BotConnector token is never sent.
import { fetch } from 'expo/fetch'
import { PadGuard } from '../lib/pad'
import { drainSse, padGuard, providerFailure, type Delta } from './api'
import { ChatError } from '../lib/types'

export const ANTHROPIC_VERSION = '2023-06-01'
/** Anthropic requires a size limit on every request; ours when the caller did not set one. */
export const ANTHROPIC_MAX_TOKENS = 4096
/** Our reasoning effort names mapped to Anthropic thinking budgets (tokens kept aside to think). */
const THINK_BUDGET: Record<string, number> = { low: 1024, medium: 2048, high: 4096 }

const dataUrl = (url: string): { media_type: string; data: string } | null => {
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/s.exec(url.trim())
  return m ? { media_type: m[1] ?? '', data: m[2] ?? '' } : null
}

/** One OpenAI-shaped chat request in, one Anthropic Messages request out. */
export function toAnthropicBody(body: Record<string, unknown>): Record<string, unknown> {
  const rawModel = String(body.model ?? '')
  const model = rawModel.startsWith('custom:') ? rawModel.slice(rawModel.indexOf(':') + 1).replace(/^[^:]+:/, '') : rawModel
  const messages = (Array.isArray(body.messages) ? body.messages : []) as { role: string; content?: unknown; tool_calls?: unknown[]; tool_call_id?: string }[]
  const system = messages.filter(m => m.role === 'system' && typeof m.content === 'string' && (m.content as string).trim()).map(m => m.content as string)
  const out: Record<string, unknown> = { model, max_tokens: typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : ANTHROPIC_MAX_TOKENS, messages: [] }
  if (system.length) out.system = system.join('\n\n')
  const translated: Record<string, unknown>[] = []
  const toolResults: Record<string, unknown>[] = []
  const flush = () => { if (toolResults.length) translated.push({ role: 'user', content: toolResults.splice(0) }) }
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') { toolResults.push({ type: 'tool_result', tool_use_id: String(m.tool_call_id ?? ''), content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }); continue }
    flush()
    if (m.role === 'assistant') {
      const blocks: Record<string, unknown>[] = []
      if (typeof m.content === 'string' && m.content) blocks.push({ type: 'text', text: m.content })
      for (const c of Array.isArray(m.tool_calls) ? m.tool_calls : []) {
        const f = (c as { function?: { name?: string; arguments?: string } }).function ?? {}
        let input: unknown = {}
        try { input = JSON.parse(f.arguments ?? '{}') } catch { /* bad arguments: sent as an empty object, the model re-asks */ }
        blocks.push({ type: 'tool_use', id: String((c as { id?: string }).id ?? ''), name: String(f.name ?? ''), input })
      }
      translated.push({ role: 'assistant', ...(blocks.length ? { content: blocks } : {}) })
      continue
    }
    if (Array.isArray(m.content)) {
      const parts = (m.content as { type: string; text?: string }[]).map(p => {
        if (p.type === 'text') return { type: 'text', text: String(p.text ?? '') }
        if (p.type === 'image_url') {
          const src = dataUrl(String((p as { image_url?: { url?: string } }).image_url?.url ?? ''))
          if (src) return { type: 'image', source: { type: 'base64', media_type: src.media_type, data: src.data } }
        }
        return { type: 'text', text: JSON.stringify(p) }   // unknown part stays visible to the model instead of vanishing
      })
      translated.push({ role: m.role, content: parts })
      continue
    }
    translated.push({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') })
  }
  flush()
  out.messages = translated
  const tools = (Array.isArray(body.tools) ? body.tools : []) as { type?: string; function?: { name: string; description?: string; parameters?: unknown } }[]
  if (tools.length) out.tools = tools.map(t => ({ name: String(t.function?.name ?? ''), ...(t.function?.description ? { description: t.function.description } : {}), input_schema: t.function?.parameters && typeof t.function.parameters === 'object' ? t.function.parameters : { type: 'object', properties: {} } }))
  const budget = typeof body.reasoning_effort === 'string' && body.reasoning_effort !== 'none' ? THINK_BUDGET[body.reasoning_effort] : undefined
  if (budget) {
    out.thinking = { type: 'enabled', budget_tokens: budget }
    out.max_tokens = Math.max(out.max_tokens as number, budget + 1024)   // Anthropic caps thinking under max_tokens
  } else if (typeof body.temperature === 'number') {
    out.temperature = body.temperature
  }
  return out
}

const stopOf = (s: string): string | undefined => (s === 'tool_use' ? 'tool_calls' : s === 'max_tokens' ? 'length' : s === 'refusal' ? 'content_filter' : s === 'end_turn' || s === 'stop_sequence' ? 'stop' : undefined)

/** One Anthropic SSE event payload in, the Delta the UI already understands out (null = nothing to show). */
export function parseAnthropicEvent(payload: string): Delta | null {
  let j: any
  try { j = JSON.parse(payload) } catch { return null }
  if (j?.type === 'content_block_delta') {
    const d = j.delta ?? {}
    if (d.type === 'text_delta' && d.text) return { content: String(d.text) }
    if (d.type === 'thinking_delta' && d.thinking) return { reasoning: String(d.thinking) }
    if (d.type === 'input_json_delta' && d.partial_json) return { toolCalls: [{ index: Number(j.index) || 0, args: String(d.partial_json) }] }
    return null
  }
  if (j?.type === 'content_block_start') {
    const b = j.content_block ?? {}
    if (b.type === 'tool_use') return { toolCalls: [{ index: Number(j.index) || 0, id: String(b.id ?? ''), name: String(b.name ?? '') }] }
    return null
  }
  if (j?.type === 'message_start') {
    const u = j.message?.usage
    return u ? { usage: { input: Number(u.input_tokens) || 0, output: 0, total: Number(u.input_tokens) || 0 } } : null
  }
  if (j?.type === 'message_delta') {
    const finish = stopOf(String(j.delta?.stop_reason ?? ''))
    const u = j.usage
    return { ...(finish ? { finish } : {}), ...(u ? { usage: { input: 0, output: Number(u.output_tokens) || 0, total: Number(u.output_tokens) || 0 } } : {}) }
  }
  return null
}

/** Error thrown for an {type:"error"} event that arrives mid-stream (never swallowed). */
export function anthropicStreamError(j: any): ChatError {
  const type = String(j?.error?.type ?? '')
  if (type === 'rate_limit_error') return new ChatError('capacity')
  if (type === 'authentication_error' || type === 'permission_error') return new ChatError('badkey')
  if (type === 'overloaded_error' || type === 'api_error') return new ChatError('unavailable')
  return new ChatError('rejected')
}

export interface AnthropicEndpoint { baseUrl: string; apiKey: string }

/** One non-streamed Anthropic message (server answered JSON instead of SSE) -> deltas. */
export function deltasOfMessage(j: any): Delta[] {
  const out: Delta[] = []
  let args: Record<number, string> | null = null
  for (const b of Array.isArray(j?.content) ? j.content : []) {
    if (b?.type === 'text' && b.text) out.push({ content: String(b.text) })
    if (b?.type === 'thinking' && b.thinking) out.push({ reasoning: String(b.thinking) })
    if (b?.type === 'tool_use') { args ??= {}; const i = Number(b.index ?? out.length); args[i] = ''; out.push({ toolCalls: [{ index: i, id: String(b.id ?? ''), name: String(b.name ?? '') }] }) }
  }
  for (const [i, text] of Object.entries(args ?? {})) out.push({ toolCalls: [{ index: Number(i), args: typeof text === 'string' ? text : String(text) }] })
  const u = j?.usage
  if (u) out.push({ usage: { input: Number(u.input_tokens) || 0, output: Number(u.output_tokens) || 0, total: (Number(u.input_tokens) || 0) + (Number(u.output_tokens) || 0) } })
  return out
}

export async function* streamClaude(body: Record<string, unknown>, ep: AnthropicEndpoint, signal?: AbortSignal): AsyncGenerator<Delta> {
  let r: Response
  try {
    r = await fetch(`${ep.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json', 'x-api-key': ep.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ ...toAnthropicBody(body), stream: true }),
      signal,
    })
  } catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (!r.ok) throw providerFailure(r.status)
  if (!(r.headers.get('content-type') || '').includes('text/event-stream') || !r.body) {
    const j = await r.json().catch(() => null); if (!j) throw new ChatError('network')
    for (const d of deltasOfMessage(j)) yield d
    return
  }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = ''; const pads = { text: new PadGuard(), thought: new PadGuard() }
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await reader.read() } catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
      if (chunk.done) break
      buf += dec.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
      const { payloads, rest } = drainSse(buf); buf = rest
      for (const p of payloads) {
        let j: any
        try { j = JSON.parse(p) } catch { continue }
        if (j?.type === 'error') throw anthropicStreamError(j)
        const d = parseAnthropicEvent(p); if (!d) continue
        if (padGuard(d, pads)) { void reader.cancel?.().catch?.(() => {}); yield { finish: 'length' }; return }
        if (d.content !== undefined || d.reasoning !== undefined || d.toolCalls || d.finish || d.usage) yield d
      }
    }
  } finally { try { reader.releaseLock?.() } catch { /* cancelled while a read was pending */ } }
}

/** GET {base}/models with the native headers; the /v1/models list is OpenAI-shaped ({data:[{id,display_name}]}). */
export async function listAnthropicModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<{ id: string; name?: string }[]> {
  let r: Response
  try { r = await fetch(`${baseUrl}/models?limit=1000`, { headers: { accept: 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }, signal }) } catch { throw new ChatError('network') }
  if (!r.ok) throw providerFailure(r.status)
  const j: any = await r.json().catch(() => null)
  const rows: any[] = Array.isArray(j?.data) ? j.data : []
  const seen = new Set<string>()
  return rows.map(x => { const id = String(x?.id ?? ''); const n = x?.display_name ?? x?.name; return { id, name: typeof n === 'string' && n !== id ? n : undefined } })
    .filter(x => x.id && !seen.has(x.id) && (seen.add(x.id), true)).slice(0, 500)
    .sort((a, b) => a.id.localeCompare(b.id))
}
