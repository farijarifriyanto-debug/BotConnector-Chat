import type { Source } from './types'

/** "[1, 3]" → "[1][3]"; numbers outside 1..n (a model inventing a source) are removed. Text inside code is left alone. */
export function fixCitations(text: string, n: number): string {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => {
    if (i % 2) return part
    return part
      .replace(/\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})+)\]/g, (_, list: string) => list.split(/\s*[,;]\s*/).map(x => `[${x}]`).join(''))
      .replace(/ ?\[(\d{1,3})\](?!\()/g, (m, k: string) => (Number(k) >= 1 && Number(k) <= n ? m : ''))
  }).join('')
}

/**
 * The model cites with [cite:id] (the short id of a search result). Before the answer is rendered
 * those markers become the numbers the source chips show, in source order; ids that belong to no
 * source are dropped. Code is left exactly as written.
 */
export function resolveCitations(text: string, sources: Source[] | undefined): string {
  const numbers = new Map<string, number>()
  for (const [i, s] of (sources ?? []).entries()) if (s.id && !numbers.has(s.id.toLowerCase())) numbers.set(s.id.toLowerCase(), i + 1)
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => {
    if (i % 2) return part
    return part.replace(/\[cite:([^\]\s]+)\]/gi, (_m, id: string) => {
      const n = numbers.get(id.toLowerCase())
      return n ? `[${n}]` : ''
    })
  }).join('')
}
