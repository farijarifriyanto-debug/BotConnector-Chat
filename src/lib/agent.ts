import { sha256 } from 'js-sha256'
import { streamCompletion, webFetch, webSearch, type SearchHit, type TokenUsage, type ToolCallDelta } from '../api/api'
import type { ChatModel, Source, WebFetchMode } from './types'
import type { ToolDef } from './toolSchema'

export interface ApiMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }

export const MAX_TOOL_ROUNDS = 5

/** Characters of a page returned per fetch_url call; longer pages continue with start_index. */
export const PAGE_SIZE = 10000

const SEARCH_DESCRIPTION = `Search the web for current information, news, and real-time data.

Use this when:
- The user asks about recent events, current prices, or live data
- You need to verify facts you are uncertain about or that may have changed
- The user references something you don't have context on (products, people, docs, APIs)

Don't use for:
- Math, code reasoning, or things you can answer from your training
- Well-known facts unlikely to have changed

Write focused keyword queries, not full sentences. You may call this multiple times to broaden coverage:
- If the topic likely has more authoritative sources in another language (English for tech/scientific topics, the local language for regional news), repeat the search with the query translated into that language.
- If the first results miss an angle, refine with synonyms or sub-aspects.

Response format:
- items[]: search results, each with index (result number), id (short unique id), title, url, text
- answer: an optional pre-synthesized answer (may be absent)

Cite: append [cite:id] immediately after each statement a result supports, using that result's exact \`id\` field.`

const FETCH_DESCRIPTION = `Read a web page and return its main content as Markdown.

Use this when:
- A search_web result looks relevant but its snippet is not enough
- The user shares a URL and asks about its content

Only fetch URLs that appear in the conversation: given by the user or returned by search_web. Pages behind logins or paywalls cannot be read.

Long pages come back in parts. When the response has \`next_start_index\`, call again with that value as \`start_index\` to keep reading.

Response format: url, title, content, total_length, and next_start_index when more content remains.`

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: SEARCH_DESCRIPTION,
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'The search query to look up online' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: FETCH_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full http(s) URL, exactly as it appears in the conversation' },
          start_index: { type: 'integer', description: 'Character offset to continue a long page from', default: 0, minimum: 0 },
        },
        required: ['url'],
      },
    },
  },
]

/** Told to the model while web search is on, so answers carry inline [cite:id] markers the app turns into source pills. */
export const CITATION_PROMPT = `<citations>
When a statement in your answer is based on a search_web result, append a citation marker immediately after that statement: [cite:id], where id is the exact \`id\` field of the supporting result item.
- Example: "The event took place yesterday afternoon. [cite:a1b2c3]"
- Chain markers when several results support one statement: [cite:a1b2c3][cite:d4e5f6]
- Copy ids exactly as returned by the tool. Never invent, renumber, or reuse ids from other results.
- Place markers inline right after the supported statement (after its punctuation). Do not collect them at the end of the response, and do not add a "References" or "Sources" section — the app renders citations from the inline markers.
- Statements from your own knowledge take no marker.
</citations>`

export interface RunOptions {
  model: ChatModel
  messages: ApiMessage[]
  web: boolean
  fileIds: string[]
  /** the tool definitions to offer; the chat store passes the built-in ones with the person's wording applied */
  tools?: ToolDef[]
  /** false turns reasoning off for models that can think (sent as reasoning_effort: none) */
  think?: boolean
  /** runs a tool that is not one of the built-in web tools (memory, device) and returns the text the model reads */
  onTool?: (name: string, args: Record<string, unknown>) => Promise<string>
  /** web page reading: follow lets the caller read through the chosen search provider, off refuses every fetch */
  fetchMode?: WebFetchMode
  /** the page reader when follow/local allow it; defaults to the app's own fetch */
  fetchPage?: (url: string, signal?: AbortSignal) => Promise<{ title: string; text: string }>
  signal?: AbortSignal
  onText: (text: string) => void
  onReasoning: (text: string) => void
  onStatus: (s: { searching?: string; reading?: string } | null) => void
}
export interface RunResult { content: string; reasoning: string; sources: Source[]; queries: string[]; usage?: TokenUsage; cost?: { micros: number; currency: string } }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

export interface SearchItem { index: number; id: string; title: string; url: string; text: string }

/** A short, stable id per page: the same URL always gets the same id, so a citation keeps working across searches. */
export const sourceId = (url: string) => 'r' + sha256(url).slice(0, 6)

/** What the model reads for one search: the reference app's { answer?, items[] } shape. */
export function searchPayload(hits: SearchHit[], start = 1): { items: SearchItem[] } {
  return { items: hits.map((h, i) => ({ index: start + i, id: sourceId(h.url), title: h.title, url: h.url, text: clip(h.snippet, 600) })) }
}

export interface PageWindow { url: string; title: string; content: string; total_length: number; next_start_index?: number }
/** One PAGE_SIZE slice of a page, never cutting a surrogate pair (emoji) in half. */
export function windowPage(url: string, title: string, content: string, start = 0): PageWindow {
  if (start >= content.length) return { url, title, content: '', total_length: content.length }
  let end = Math.min(start + PAGE_SIZE, content.length)
  const last = content.charCodeAt(end - 1)
  if (end < content.length && last >= 0xD800 && last <= 0xDBFF) end -= 1
  const page: PageWindow = { url, title, content: content.slice(start, end), total_length: content.length }
  if (end < content.length) page.next_start_index = end
  return page
}

function addSources(into: Source[], hits: { title: string; url: string }[]) {
  for (const h of hits) if (!into.some(s => s.url === h.url)) into.push({ title: h.title, url: h.url, id: sourceId(h.url) })
}

/** Assembles streamed tool-call fragments by index. */
export function mergeToolCalls(acc: Map<number, { id: string; name: string; args: string }>, parts: ToolCallDelta[]) {
  for (const p of parts) {
    const cur = acc.get(p.index) ?? { id: '', name: '', args: '' }
    if (p.id) cur.id = p.id
    if (p.name) cur.name = p.name
    if (p.args) cur.args += p.args
    acc.set(p.index, cur)
  }
}

/** One assistant answer: streams text, and when web access is on lets the model search/read pages (up to MAX_TOOL_ROUNDS rounds). */
export async function runAssistant(o: RunOptions): Promise<RunResult> {
  const messages = [...o.messages]
  const sources: Source[] = [], queries: string[] = []
  let content = '', reasoning = '', usage: TokenUsage | undefined, cost: RunResult['cost']
  const useTools = o.model.tools && (o.tools ?? TOOLS).length > 0
  const mode = o.fetchMode ?? 'follow'
  const readPage = o.fetchPage ?? webFetch

  if (o.web) {   // the user switched web search on: always search first with their question (a model left to decide may just ask for details), then answer from the results; tool-capable models may search more
    const q = lastUserText(messages)
    if (q) {
      o.onStatus({ searching: q }); queries.push(q)
      try {
        const hits = await webSearch(clip(q, 200), o.signal)
        if (hits.length) {
          addSources(sources, hits)
          messages.unshift({ role: 'system', content: 'The user turned web search on. Below are web search results for their latest question. Answer from them, cite each statement with the result ids, and do not ask for more details when the results already let you help. If they do not answer it, say so.\n\n' + JSON.stringify(searchPayload(hits)) })
        }
      } catch { /* answer without search */ }
      o.onStatus(null)
    }
    messages.unshift({ role: 'system', content: CITATION_PROMPT })
  }

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const calls = new Map<number, { id: string; name: string; args: string }>()
    let roundText = '', finish = ''
    const body: Record<string, unknown> = { model: o.model.id, messages }
    if (o.fileIds.length) body.botconnector_file_ids = o.fileIds.slice(0, 10)
    if (o.think === false) body.reasoning_effort = 'none'
    if (useTools && round < MAX_TOOL_ROUNDS) body.tools = o.tools ?? TOOLS
    for await (const d of streamCompletion(body, o.signal)) {
      if (d.reasoning) { reasoning += d.reasoning; o.onReasoning(reasoning) }
      if (d.content) { roundText += d.content; content += d.content; o.onText(content) }
      if (d.toolCalls) mergeToolCalls(calls, d.toolCalls)
      if (d.usage) usage = d.usage
      if (d.cost) cost = d.cost
      if (d.finish) finish = d.finish
    }
    if (!calls.size || !useTools || round >= MAX_TOOL_ROUNDS) break
    const list = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], i) => ({ ...c, id: c.id || `call_${round}_${i}` }))
    messages.push({ role: 'assistant', content: roundText || null, tool_calls: list.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) })
    for (const c of list) {
      let result = ''
      let args: any = {}
      try { args = JSON.parse(c.args || '{}') } catch { /* bad arguments: reported below */ }
      try {
        if (c.name === 'search_web' && typeof args.query === 'string' && args.query.trim()) {
          o.onStatus({ searching: args.query }); queries.push(args.query)
          const hits = await webSearch(clip(args.query, 200), o.signal); addSources(sources, hits)
          result = JSON.stringify(searchPayload(hits))
        } else if (c.name === 'fetch_url' && typeof args.url === 'string' && /^https?:\/\//i.test(args.url)) {
          const asked = typeof args.start_index === 'number' && Number.isFinite(args.start_index) ? Math.floor(args.start_index) : 0
          if (asked < 0) result = JSON.stringify({ error: 'start_index must not be negative' })
          else if (mode === 'off') result = JSON.stringify({ error: 'Reading web pages is turned off' })
          else {
            o.onStatus({ reading: args.url })
            const page = await readPage(args.url, o.signal); addSources(sources, [{ title: page.title, url: args.url }])
            result = JSON.stringify(windowPage(args.url, page.title, page.text, asked))
          }
        } else if (o.onTool) {
          result = await o.onTool(c.name, args as Record<string, unknown>)
        } else result = 'Invalid tool call.'
      } catch (e) {
        if ((e as { kind?: string })?.kind === 'aborted') throw e
        result = 'The tool is unavailable right now. Answer from what you know and say that live data could not be fetched.'
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: result })
    }
    o.onStatus(null)
    void finish
  }
  o.onStatus(null)
  return { content, reasoning, sources, queries, ...(usage ? { usage } : {}), ...(cost ? { cost } : {}) }
}

export function lastUserText(messages: ApiMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]; if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content.trim()
    if (Array.isArray(m.content)) return m.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join(' ').trim()
  }
  return ''
}
