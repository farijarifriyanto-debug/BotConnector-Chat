/** Markdown to something pleasant to hear: no code blocks, link targets, citation numbers or symbols. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\d+(?:,\s*\d+)*\]/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+\.\s+/gm, '').replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~|]/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ').trim()
}
