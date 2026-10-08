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
