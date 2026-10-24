// Bring-your-own-key web search. The query goes straight from the phone to the provider the user picked.
import { fetch } from 'expo/fetch'
import { ChatError } from '../lib/types'

export type SearchProviderId = 'botconnector' | 'brave' | 'tavily' | 'exa' | 'parallel'
export const BYOK_PROVIDERS: Exclude<SearchProviderId, 'botconnector'>[] = ['brave', 'tavily', 'exa', 'parallel']
export interface Hit { title: string; url: string; snippet: string }
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '')

async function json(url: string, init: { method: string; headers: Record<string, string>; body?: string }, signal?: AbortSignal): Promise<any> {
  let r: Response
  try { r = await fetch(url, { ...init, signal }) } catch (e) { throw (e as Error)?.name === 'AbortError' ? new ChatError('aborted') : new ChatError('network') }
  if (r.status === 401 || r.status === 403) throw new ChatError('badkey', { status: r.status })
  if (r.status === 429) throw new ChatError('capacity', { status: r.status })
  if (!r.ok) throw new ChatError('unavailable', { status: r.status })
  return r.json().catch(() => ({}))
}
const shape = (rows: any[], title: string, url: string, snippet: (r: any) => unknown): Hit[] =>
  rows.filter(r => r && typeof r[url] === 'string' && /^https?:\/\//.test(r[url])).map(r => ({ title: clip(r[title] || r[url], 200), url: r[url], snippet: clip(snippet(r), 700) }))

export async function byokSearch(id: Exclude<SearchProviderId, 'botconnector'>, key: string, query: string, max: number, signal?: AbortSignal): Promise<Hit[]> {
  if (!key.trim()) throw new ChatError('badkey')
  const k = key.trim()
  switch (id) {
    case 'brave': { const j = await json(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, { method: 'GET', headers: { accept: 'application/json', 'x-subscription-token': k } }, signal); return shape(j?.web?.results ?? [], 'title', 'url', r => r.description) }
    case 'tavily': { const j = await json('https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ query, max_results: max, search_depth: 'basic' }) }, signal); return shape(j?.results ?? [], 'title', 'url', r => r.content) }
    case 'exa': { const j = await json('https://api.exa.ai/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k }, body: JSON.stringify({ query, numResults: max, contents: { highlights: true, summary: true } }) }, signal); return shape(j?.results ?? [], 'title', 'url', r => (Array.isArray(r.highlights) && r.highlights.length ? r.highlights.join(' ') : r.summary ?? r.text)) }
    case 'parallel': { const j = await json('https://api.parallel.ai/v1/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k }, body: JSON.stringify({ objective: query, max_results: max }) }, signal); return shape(j?.results ?? [], 'title', 'url', r => (r.excerpts ?? []).join(' ')) }
  }
}

/** Providers whose own API can also return the text of a page (not just search results). */
export const BYOK_READERS: Exclude<SearchProviderId, 'botconnector'>[] = ['tavily', 'exa']

/**
 * Reads one page through the user's own provider, like the reference app's page-reading setting.
 * Returns null when that provider cannot read pages or returns nothing usable.
 */
export async function byokFetch(id: Exclude<SearchProviderId, 'botconnector'>, key: string, url: string, signal?: AbortSignal): Promise<{ title: string; text: string } | null> {
  if (!BYOK_READERS.includes(id) || !key.trim()) return null
  const k = key.trim()
  if (id === 'tavily') {
    const j = await json('https://api.tavily.com/extract', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ urls: [url], format: 'markdown' }) }, signal)
    const row = (j?.results ?? []).find((r: any) => r && typeof r.raw_content === 'string' && r.raw_content)
    return row ? { title: clip(row.title || url, 200), text: String(row.raw_content) } : null
  }
  const j = await json('https://api.exa.ai/contents', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k }, body: JSON.stringify({ urls: [url], text: { maxCharacters: 200000 } }) }, signal)
  const row = (j?.results ?? [])[0]
  return row && typeof row.text === 'string' && row.text ? { title: clip(row.title || url, 200), text: String(row.text) } : null
}
