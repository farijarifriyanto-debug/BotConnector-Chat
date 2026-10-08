import { streamCompletion, webFetch, webSearch, type ToolCallDelta } from '../api/api'
import type { ChatModel, Source } from './types'

export interface ApiMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }

export const MAX_TOOL_ROUNDS = 5

export const TOOLS = [
  { type: 'function', function: { name: 'web_search', description: 'Search the internet for current or factual information (news, prices, recent events, anything you are not sure about). Returns titles, links and snippets.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'read_url', description: 'Open a web page and read its text. Use after web_search when a result needs a closer look.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full http(s) URL' } }, required: ['url'] } } },
]

export interface RunOptions {
  model: ChatModel
  messages: ApiMessage[]
  web: boolean
  fileIds: string[]
  signal?: AbortSignal
  onText: (text: string) => void
  onReasoning: (text: string) => void
  onStatus: (s: { searching?: string; reading?: string } | null) => void
}
export interface RunResult { content: string; reasoning: string; sources: Source[]; queries: string[] }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
export const hitsToText = (hits: { title: string; url: string; snippet: string }[], start = 1) => hits.map((h, i) => `[${start + i}] ${h.title}\n${h.url}\n${clip(h.snippet, 600)}`).join('\n\n')

function addSources(into: Source[], hits: { title: string; url: string }[]) {
  for (const h of hits) if (!into.some(s => s.url === h.url)) into.push({ title: h.title, url: h.url })
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
  let content = '', reasoning = ''
  const useTools = o.web && o.model.tools

  if (o.web && !o.model.tools) {   // model cannot call tools: search first with the user's question, then answer from the results
    const q = lastUserText(messages)
    if (q) {
      o.onStatus({ searching: q }); queries.push(q)
      try {
        const hits = await webSearch(clip(q, 200), o.signal)
        if (hits.length) { addSources(sources, hits); messages.unshift({ role: 'system', content: 'Web search results for the user\'s latest question. Use them when relevant and cite as [1], [2]. If they do not answer it, say so.\n\n' + hitsToText(hits) }) }
      } catch { /* answer without search */ }
      o.onStatus(null)
    }
  }

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const calls = new Map<number, { id: string; name: string; args: string }>()
    let roundText = '', finish = ''
    const body: Record<string, unknown> = { model: o.model.id, messages }
    if (o.fileIds.length) body.botconnector_file_ids = o.fileIds.slice(0, 10)
    if (useTools && round < MAX_TOOL_ROUNDS) body.tools = TOOLS
    for await (const d of streamCompletion(body, o.signal)) {
      if (d.reasoning) { reasoning += d.reasoning; o.onReasoning(reasoning) }
      if (d.content) { roundText += d.content; content += d.content; o.onText(content) }
      if (d.toolCalls) mergeToolCalls(calls, d.toolCalls)
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
        if (c.name === 'web_search' && typeof args.query === 'string' && args.query.trim()) {
          o.onStatus({ searching: args.query }); queries.push(args.query)
          const hits = await webSearch(clip(args.query, 200), o.signal); addSources(sources, hits)
          result = hits.length ? hitsToText(hits, sources.length - hits.length + 1) : 'No results.'
        } else if (c.name === 'read_url' && typeof args.url === 'string' && /^https?:\/\//i.test(args.url)) {
          o.onStatus({ reading: args.url })
          const page = await webFetch(args.url, o.signal); addSources(sources, [{ title: page.title, url: args.url }])
          result = clip(page.text, 9000) || 'The page has no readable text.'
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
  return { content, reasoning, sources, queries }
}

export function lastUserText(messages: ApiMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]; if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content.trim()
    if (Array.isArray(m.content)) return m.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join(' ').trim()
  }
  return ''
}
