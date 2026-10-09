/** One width per column, shared by every row, so cells line up (each row used to size its own cells). Estimated from the text: no measuring pass, no layout flicker while an answer streams. */
export const COL_MIN = 88, COL_MAX = 240, CHAR_PX = 8.2, PAD_PX = 16

export function columnWidths(header: string[], rows: string[][]): number[] {
  const n = Math.max(header.length, ...rows.map(r => r.length), 0)
  return Array.from({ length: n }, (_, c) => {
    let longest = 0, word = 0
    for (const text of [header[c] ?? '', ...rows.map(r => r[c] ?? '')]) {
      const t = text.replace(/\s+/g, ' ').trim()
      longest = Math.max(longest, t.length)
      for (const w of t.split(' ')) word = Math.max(word, w.length)
    }
    const natural = longest * CHAR_PX + PAD_PX, wordFit = word * (CHAR_PX + 0.2) + PAD_PX
    return Math.round(Math.min(COL_MAX, Math.max(COL_MIN, natural, wordFit)))
  })
}
