import type { Conv } from './types'

/** A chat as plain Markdown text (what Share and Copy hand to other apps). Pictures and files are named, not embedded. */
export function toMarkdown(c: Conv, labels: { you: string; assistant: string }): string {
  const out: string[] = [`# ${c.title || 'Chat'}`]
  for (const m of c.messages) {
    out.push(`## ${m.role === 'user' ? labels.you : m.model ? `${labels.assistant} (${m.model})` : labels.assistant}`)
    const names = (m.attachments ?? []).map(a => `[${a.kind === 'image' ? 'image' : 'file'}: ${a.name}]`).join(' ')
    const body = (m.shown ?? m.content).trim() || (m.image?.prompt ? `[image: ${m.image.prompt}]` : '')
    if (names) out.push(names)
    if (body) out.push(body)
    if (m.sources?.length) out.push(m.sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join('\n'))
  }
  return out.join('\n\n') + '\n'
}
