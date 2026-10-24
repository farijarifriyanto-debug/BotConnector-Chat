import { newId } from './conv'

/** A saved snippet: a short label the list shows, and the text that goes into the message box. */
export interface QuickPhrase { id: string; title: string; content: string }

/** Keeps only what can be shown again after a restart: content is required, a blank title falls back to it. */
export function readPhrases(raw: unknown): QuickPhrase[] {
  const rows = Array.isArray(raw) ? raw : []
  const out: QuickPhrase[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const content = typeof r.content === 'string' ? r.content.trim().slice(0, 8000) : ''
    if (!content) continue
    const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 120) : content.slice(0, 60)
    const id = typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : newId()
    if (out.some(p => p.id === id)) continue
    out.push({ id, title, content })
    if (out.length >= 200) break
  }
  return out
}

export interface PhraseSelection { start: number; end: number }

/**
 * Puts the phrase where the caret is (replacing a selection), like the reference app. A selection
 * that no longer fits the text appends instead, and a blank phrase changes nothing.
 */
export function insertPhrase(text: string, content: string, selection?: PhraseSelection | null): { text: string; caret: number } {
  if (!content.trim()) return { text, caret: text.length }
  const len = text.length
  const start = selection && Number.isInteger(selection.start) ? selection.start : len
  const end = selection && Number.isInteger(selection.end) ? selection.end : start
  if (start < 0 || end < start || end > len) return { text: text + content, caret: len + content.length }
  return { text: text.slice(0, start) + content + text.slice(end), caret: start + content.length }
}
