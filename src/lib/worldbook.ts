/**
 * World Book (lorebook): entries with keyword triggers that are injected into a request.
 * Ported from the reference app (`WorldBookActivation` + `injectWorldBookPrompts`):
 * scan the last `scanDepth` user/assistant messages, activate on keywords (contains by
 * default, optional regex), group by position then role, merge, and wrap user-role lore
 * in a <system> tag so the model reads it as context rather than as the person's words.
 */
import type { ApiMessage } from './agent'

export type LorePosition = 'beforeSystem' | 'afterSystem' | 'topOfChat' | 'bottomOfChat' | 'atDepth'
export type LoreRole = 'user' | 'assistant'

export interface LoreEntry {
  id: string
  name: string
  enabled: boolean
  priority: number
  position: LorePosition
  content: string
  /** for position 'atDepth': how many messages from the end the lore sits before (0 = after the last one) */
  injectDepth: number
  role: LoreRole
  keywords: string[]
  useRegex: boolean
  caseSensitive: boolean
  /** how many recent messages are searched for the keywords */
  scanDepth: number
  /** always injected, no keyword needed */
  constantActive: boolean
}

export interface WorldBook {
  id: string
  name: string
  description: string
  enabled: boolean
  entries: LoreEntry[]
}

export const LORE_POSITIONS: LorePosition[] = ['afterSystem', 'beforeSystem', 'topOfChat', 'bottomOfChat', 'atDepth']
export const newEntry = (): LoreEntry => ({
  id: '', name: '', enabled: true, priority: 0, position: 'afterSystem', content: '', injectDepth: 4,
  role: 'user', keywords: [], useRegex: false, caseSensitive: false, scanDepth: 4, constantActive: false,
})

const textOf = (m: ApiMessage): string =>
  typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p: unknown) => (p as { type?: string; text?: string })?.type === 'text' ? String((p as { text?: string }).text ?? '') : '').join(' ') : ''

/** Does this entry fire for the text it can see? */
export function entryMatches(e: LoreEntry, context: string): boolean {
  if (!e.enabled) return false
  if (e.constantActive) return true
  for (const raw of e.keywords) {
    const keyword = raw.trim()
    if (!keyword) continue
    if (e.useRegex) {
      try { if (new RegExp(keyword, e.caseSensitive ? '' : 'i').test(context)) return true } catch { /* one bad expression must not hide the others */ }
    } else if (e.caseSensitive ? context.includes(keyword) : context.toLowerCase().includes(keyword.toLowerCase())) return true
  }
  return false
}

/** Entries that fire for this request, highest priority first, ties in book/entry order. */
export function activatedEntries(books: WorldBook[], messages: ApiMessage[]): LoreEntry[] {
  const scan = messages.filter(m => (m.role === 'user' || m.role === 'assistant') && textOf(m).trim())
  const found: { entry: LoreEntry; seq: number }[] = []
  let seq = 0
  for (const book of books) {
    if (!book.enabled) continue
    for (const entry of book.entries) {
      const order = seq++
      if (!entry.enabled || !entry.content.trim()) continue
      const depth = Math.min(Math.max(entry.scanDepth, 1), 200)
      const context = scan.slice(-depth).map(m => textOf(m).trim()).join('\n')
      if (entryMatches(entry, context)) found.push({ entry, seq: order })
    }
  }
  found.sort((a, b) => b.entry.priority - a.entry.priority || a.seq - b.seq)
  return found.map(f => f.entry)
}

const joinContents = (items: LoreEntry[]): string => items.map(e => e.content.trim()).filter(Boolean).join('\n')
const tagged = (content: string): string => `<system>\n${content}\n</system>`
const merged = (items: LoreEntry[]): ApiMessage[] => {
  const byRole = new Map<LoreRole, LoreEntry[]>()
  for (const e of items) { if (!e.content.trim()) continue; byRole.set(e.role, [...(byRole.get(e.role) ?? []), e]) }
  const out: ApiMessage[] = []
  for (const [role, group] of byRole) {
    const content = joinContents(group)
    if (content) out.push({ role, content: role === 'assistant' ? content : tagged(content) })
  }
  return out
}

/** Where the lore may go: never between the system message and the first user turn other than at the top of the chat. */
const safeIndex = (messages: ApiMessage[], target: number): number => {
  let i = Math.min(Math.max(target, 0), messages.length)
  while (i > 0 && i < messages.length && messages[i].role === 'tool') i--
  return i
}

/** Puts the activated lore into the message list the server will see. */
export function applyLore(messages: ApiMessage[], entries: LoreEntry[]): ApiMessage[] {
  if (!entries.length) return messages
  const out = messages.map(m => ({ ...m }))
  const byPosition = new Map<LorePosition, LoreEntry[]>()
  for (const e of entries) byPosition.set(e.position, [...(byPosition.get(e.position) ?? []), e])

  const before = joinContents(byPosition.get('beforeSystem') ?? [])
  const after = joinContents(byPosition.get('afterSystem') ?? [])
  if (before || after) {
    const at = out.findIndex(m => m.role === 'system')
    const block = [before, after].filter(Boolean).join('\n')
    if (at >= 0) {
      const original = textOf(out[at])
      const parts = [before, original, after].filter(Boolean)
      out[at] = { ...out[at], content: parts.join('\n') }
    } else out.unshift({ role: 'system', content: block })
  }

  const top = byPosition.get('topOfChat')
  if (top?.length) {
    const firstUser = out.findIndex(m => m.role === 'user')
    out.splice(safeIndex(out, firstUser < 0 ? out.length : firstUser), 0, ...merged(top))
  }

  const bottom = byPosition.get('bottomOfChat')
  if (bottom?.length) out.splice(safeIndex(out, out.length - 1), 0, ...merged(bottom))

  const atDepth = byPosition.get('atDepth')
  if (atDepth?.length) {
    const historyStart = out.findIndex(m => m.role !== 'system')
    const start = historyStart < 0 ? out.length : historyStart
    const originalLength = out.length
    const byDepth = new Map<number, LoreEntry[]>()
    for (const e of atDepth) {
      const d = Math.min(Math.max(e.injectDepth, 0), 200)
      byDepth.set(d, [...(byDepth.get(d) ?? []), e])
    }
    let inserted = 0
    for (const depth of [...byDepth.keys()].sort((a, b) => b - a)) {
      const index = safeIndex(out, Math.min(Math.max(originalLength - depth, start), originalLength) + inserted)
      const block = merged(byDepth.get(depth) ?? [])
      out.splice(index, 0, ...block)
      inserted += block.length
    }
  }
  return out
}

/** Keeps only what the app can show again after a restart. */
export function readBooks(raw: unknown): WorldBook[] {
  const books = Array.isArray((raw as { books?: unknown })?.books) ? (raw as { books: unknown[] }).books : []
  const out: WorldBook[] = []
  for (const row of books.slice(0, 50)) {
    const b = row as Partial<WorldBook>
    if (typeof b?.id !== 'string' || !b.id) continue
    const entries: LoreEntry[] = []
    for (const e of Array.isArray(b.entries) ? b.entries.slice(0, 200) : []) {
      const entry = e as Partial<LoreEntry>
      if (typeof entry?.id !== 'string' || !entry.id) continue
      entries.push({
        id: entry.id,
        name: String(entry.name ?? '').slice(0, 120),
        enabled: entry.enabled !== false,
        priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 0,
        position: LORE_POSITIONS.includes(entry.position as LorePosition) ? entry.position as LorePosition : 'afterSystem',
        content: String(entry.content ?? '').slice(0, 20_000),
        injectDepth: Math.min(Math.max(Number(entry.injectDepth) || 0, 0), 200),
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        keywords: Array.isArray(entry.keywords) ? entry.keywords.filter((k: unknown): k is string => typeof k === 'string' && !!k.trim()).slice(0, 50) : [],
        useRegex: entry.useRegex === true,
        caseSensitive: entry.caseSensitive === true,
        scanDepth: Math.min(Math.max(Number(entry.scanDepth) || 4, 1), 200),
        constantActive: entry.constantActive === true,
      })
    }
    out.push({ id: b.id, name: String(b.name ?? '').slice(0, 120), description: String(b.description ?? '').slice(0, 500), enabled: b.enabled !== false, entries })
  }
  return out
}

/** "kopi, senja" -> ['kopi', 'senja'] */
export const splitKeywords = (raw: string): string[] => raw.split(/[,\n]/).map(k => k.trim()).filter(Boolean)
