import type { ApiMessage } from './agent'
import type { Conv, Msg, ProjectFile } from './types'

export const MEMORY_ID = 'bc-memory-v1'
export const MEMORY_MAX = 100, MEMORY_ITEM_MAX = 400, INSTR_MAX = 1500, PROJECT_FILES_MAX = 10

import { randomUUID } from 'expo-crypto'
export const newId = (): string => randomUUID()

export function newConv(model: string, projectId?: string): Conv {
  const now = Date.now()
  return { id: newId(), title: '', model, system: '', web: false, createdAt: now, updatedAt: now, messages: [], ...(projectId ? { projectId } : {}) }
}

export const isChat = (c: Conv) => !c.kind
export const blankRecord = (kind: 'project' | 'memory', id: string, title = ''): Conv => { const now = Date.now(); return { id, kind, title, model: '', system: '', web: false, createdAt: now, updatedAt: now, messages: [] } }

/** Everything the user told the AI about themselves and the project, in front of the chat's own instructions. */
export function composedSystem(conv: Conv, all: Conv[]): string {
  const mem = all.find(c => c.kind === 'memory'), proj = conv.projectId ? all.find(c => c.kind === 'project' && c.id === conv.projectId) : undefined
  const parts: string[] = []
  if (mem?.system.trim()) parts.push('The user\'s standing instructions:\n' + mem.system.trim())
  if (mem && mem.useMemory !== false && mem.memory?.length) parts.push('Things the user asked you to remember:\n' + mem.memory.map(x => '- ' + x).join('\n'))
  if (proj && proj.system.trim()) parts.push(`Instructions for the project "${proj.title}":\n` + proj.system.trim())
  if (conv.system.trim()) parts.push(conv.system.trim())
  return parts.join('\n\n')
}

/** Project documents that finished processing (they join the chat's own attachments). */
export const projectFileIds = (conv: Conv, all: Conv[]): string[] =>
  conv.projectId ? (all.find(c => c.kind === 'project' && c.id === conv.projectId)?.files ?? []).filter((f: ProjectFile) => f.status !== 'failed' && f.status !== 'uploading' && f.status !== 'processing').map(f => f.fileId) : []

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 48 ? t.slice(0, 47).replace(/\s+\S*$/, '') + '…' : t
}

/** Everything the server needs for the next answer; an edited or regenerated turn simply passes a shorter message list. */
export function toApiMessages(system: string, messages: Msg[], vision: boolean): ApiMessage[] {
  const out: ApiMessage[] = []
  if (system.trim()) out.push({ role: 'system', content: system.trim() })
  for (const m of messages) {
    if (m.role === 'assistant') { if (m.content.trim()) out.push({ role: 'assistant', content: m.content }); else if (m.image && !m.error) out.push({ role: 'assistant', content: '[An image was generated for the previous request.]' }); continue }
    const images = vision ? (m.attachments ?? []).filter(a => a.kind === 'image' && a.dataUrl) : []
    out.push({ role: 'user', content: images.length ? [{ type: 'text', text: m.content || ' ' }, ...images.map(a => ({ type: 'image_url', image_url: { url: a.dataUrl } }))] : m.content })
  }
  return out
}

/** Document ids attached anywhere in the conversation (the server picks the relevant parts for each question). */
export function fileIdsOf(messages: Msg[], extra: string[] = []): string[] {
  const ids: string[] = [...extra]
  for (const m of messages) for (const a of m.attachments ?? []) if (a.kind === 'file' && a.fileId && a.status !== 'failed' && !ids.includes(a.fileId)) ids.push(a.fileId)
  return ids.slice(-10)
}

export function groupByDay(convs: { updatedAt: number }[], now = new Date()): { key: 'today' | 'yesterday' | 'week' | 'older'; items: number[] }[] {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = day(now), DAY = 86_400_000
  const buckets: Record<string, number[]> = { today: [], yesterday: [], week: [], older: [] }
  convs.forEach((c, i) => {
    const age = Math.round((today - day(new Date(c.updatedAt))) / DAY)
    buckets[age <= 0 ? 'today' : age === 1 ? 'yesterday' : age < 7 ? 'week' : 'older'].push(i)
  })
  return (['today', 'yesterday', 'week', 'older'] as const).filter(k => buckets[k].length).map(k => ({ key: k, items: buckets[k] }))
}
