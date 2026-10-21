// Pure transcript reducer: relay/Device-CLI SSE frames in, renderable entries out.
// No React, no network â€” every rule here is pinned by __tests__/agentreduce.test.ts.
import type { AgentBaseline, AgentEntry, AgentFrame, AgentItem, AgentView } from './types'

export const emptyView: AgentView = { entries: [], pending: null, turn: 'idle', usage: null, error: null, omitted: 0 }

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(p => (p && typeof p === 'object' && (p as { type?: string }).type === 'text' ? String((p as { text?: string }).text ?? '') : '')).join('')
  return ''
}

export const baselineToView = (baseline: AgentBaseline): AgentView => {
  const entries: AgentEntry[] = (Array.isArray(baseline?.messages) ? baseline.messages : [])
    .map((m, i): AgentEntry | null => {
      const text = textOf(m?.content)
      if (!text) return null
      const id = `base-${i}`
      return m?.role === 'user' ? { kind: 'user', id, text } : { kind: 'text', id, text }
    })
    .filter((e): e is AgentEntry => e !== null)
  return { entries, pending: null, turn: 'idle', usage: null, error: null, omitted: Number(baseline?.omittedCount) > 0 ? Number(baseline.omittedCount) : 0 }
}

export const appendUser = (view: AgentView, text: string): AgentView => {
  const t = String(text ?? '').trim()
  if (!t) return view
  return { ...view, entries: [...view.entries, { kind: 'user', id: `user-${view.entries.length}`, text: t }] }
}

/** Appends a delta to the last entry of the same kind, or starts a new one. */
function pushDelta(view: AgentView, kind: 'text' | 'thinking', delta: string): AgentView {
  if (!delta) return view
  const last = view.entries[view.entries.length - 1]
  if (last && last.kind === kind) {
    const merged: AgentEntry = { ...last, text: last.text + delta }
    return { ...view, entries: [...view.entries.slice(0, -1), merged] }
  }
  return { ...view, entries: [...view.entries, { kind, id: `${kind}-${view.entries.length}`, text: delta }] }
}

const toolName = (item: Extract<AgentItem, { type: 'tool_use' | 'tool_result' }>): string => String(item.tool ?? item.name ?? 'tool')
const toolKey = (item: { id?: string }, tool: string, target: string | undefined, index: number) => String(item.id ?? `${tool}:${target ?? ''}:${index}`)

function upsertToolResult(view: AgentView, item: Extract<AgentItem, { type: 'tool_result' }>): AgentView {
  const tool = toolName(item)
  const target = item.target ? String(item.target) : undefined
  const byId = item.id ? view.entries.findIndex(e => e.kind === 'tool' && e.id === String(item.id)) : -1
  const idx = byId >= 0 ? byId : (() => {
    for (let i = view.entries.length - 1; i >= 0; i -= 1) {
      const e = view.entries[i]
      if (e.kind === 'tool' && e.status === 'running' && e.tool === tool && e.target === target) return i
    }
    return -1
  })()
  const patch = {
    status: (item.isError ? 'error' : 'ok') as 'error' | 'ok',
    ...(typeof item.output === 'string' ? { output: item.output } : {}),
    ...(typeof item.display === 'string' ? { display: item.display } : {}),
  }
  if (idx < 0) {
    const entry: AgentEntry = { kind: 'tool', id: toolKey(item, tool, target, view.entries.length), tool, target, ...patch }
    return { ...view, entries: [...view.entries, entry] }
  }
  const entries = view.entries.slice()
  entries[idx] = { ...(entries[idx] as Extract<AgentEntry, { kind: 'tool' }>), ...patch }
  return { ...view, entries }
}

export function reduceFrame(view: AgentView, frame: AgentFrame): AgentView {
  const failure = (frame as { error?: { code?: string; message?: string } })?.error
  if (failure && typeof failure === 'object') {
    const code = typeof failure.code === 'string' && failure.code ? failure.code : 'unavailable'
    const text = String(failure.message ?? '')
    const entry: AgentEntry = { kind: 'error', id: `error-${view.entries.length}`, code, text }
    return { ...view, entries: [...view.entries, entry], pending: null, turn: 'idle', error: code }
  }
  const item = (frame as { event?: { item?: AgentItem } })?.event?.item
  if (!item || typeof item !== 'object') return view
  const type = (item as { type?: string }).type

  if (type === 'text') {
    const v = item as Extract<AgentItem, { type: 'text' }>
    return pushDelta({ ...view, turn: view.turn === 'idle' ? 'running' : view.turn }, 'text', String(v.delta ?? v.text ?? ''))
  }
  if (type === 'thinking') {
    const v = item as Extract<AgentItem, { type: 'thinking' }>
    return pushDelta(view, 'thinking', String(v.delta ?? v.text ?? ''))
  }
  if (type === 'tool_use') {
    const v = item as Extract<AgentItem, { type: 'tool_use' }>
    const tool = toolName(v)
    const target = v.target ? String(v.target) : undefined
    const entry: AgentEntry = { kind: 'tool', id: toolKey(v, tool, target, view.entries.length), tool, target, status: 'running' }
    return { ...view, turn: view.turn === 'idle' ? 'running' : view.turn, entries: [...view.entries, entry] }
  }
  if (type === 'tool_result') {
    return upsertToolResult({ ...view, turn: view.turn === 'idle' ? 'running' : view.turn }, item as Extract<AgentItem, { type: 'tool_result' }>)
  }
  if (type === 'approval_request') {
    const v = item as Extract<AgentItem, { type: 'approval_request' }>
    if (!v.requestId) return view
    return { ...view, pending: { requestId: String(v.requestId), tool: v.tool, kind: v.kind, target: v.target, preview: v.preview }, turn: 'awaiting_approval' }
  }
  if (type === 'result') {
    const v = item as Extract<AgentItem, { type: 'result' }>
    const text = String(v.text ?? '')
    const entries = text ? [...view.entries, { kind: 'result', id: `result-${view.entries.length}`, text } as AgentEntry] : view.entries
    return { ...view, entries, pending: null, turn: 'idle', usage: v.usage ?? view.usage, error: null }
  }
  return view
}
