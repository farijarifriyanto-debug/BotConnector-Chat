import { baselineToView, emptyView, appendUser, reduceFrame } from '../src/agent/reduce'
import type { AgentFrame } from '../src/agent/types'

const item = (value: unknown): AgentFrame => ({ event: { item: value as never } })

describe('agent frame reducer', () => {
  it('accumulates text deltas and starts a new entry when the kind changes', () => {
    let v = reduceFrame(emptyView, item({ type: 'text', delta: 'Hel' }))
    v = reduceFrame(v, item({ type: 'text', delta: 'lo' }))
    v = reduceFrame(v, item({ type: 'thinking', text: 'plan first' }))
    v = reduceFrame(v, item({ type: 'text', delta: ' again' }))
    expect(v.entries.map(e => e.kind)).toEqual(['text', 'thinking', 'text'])
    expect(v.entries[0]).toMatchObject({ text: 'Hello' })
    expect(v.entries[2]).toMatchObject({ text: ' again' })
  })

  it('pairs tool_use with tool_result by id, and falls back to tool plus target', () => {
    let v = reduceFrame(emptyView, item({ type: 'tool_use', id: 't1', tool: 'edit', target: 'a.ts' }))
    v = reduceFrame(v, item({ type: 'tool_result', id: 't1', output: 'ok', display: '@@ -1 +1 @@' }))
    expect(v.entries).toHaveLength(1)
    expect(v.entries[0]).toMatchObject({ kind: 'tool', tool: 'edit', status: 'ok', display: '@@ -1 +1 @@' })

    let w = reduceFrame(emptyView, item({ type: 'tool_use', tool: 'read', target: 'b.ts' }))
    w = reduceFrame(w, item({ type: 'tool_result', tool: 'read', target: 'b.ts', output: 'file' }))
    expect(w.entries).toHaveLength(1)
    expect(w.entries[0]).toMatchObject({ kind: 'tool', tool: 'read', target: 'b.ts', status: 'ok' })
  })

  it('marks a failed tool result as an error card', () => {
    let v = reduceFrame(emptyView, item({ type: 'tool_use', id: 't1', tool: 'bash', target: 'rm -rf /' }))
    v = reduceFrame(v, item({ type: 'tool_result', id: 't1', output: 'denied', isError: true }))
    expect(v.entries[0]).toMatchObject({ kind: 'tool', status: 'error', output: 'denied' })
  })

  it('sets and clears the pending approval and records usage on result', () => {
    let v = reduceFrame(emptyView, item({ type: 'approval_request', requestId: 'r1', tool: 'edit', preview: '-old\n+new' }))
    expect(v.pending?.requestId).toBe('r1')
    expect(v.turn).toBe('awaiting_approval')
    v = reduceFrame(v, item({ type: 'result', text: 'done', usage: { inputTokens: 10, outputTokens: 2 } }))
    expect(v.pending).toBeNull()
    expect(v.turn).toBe('idle')
    expect(v.usage).toEqual({ inputTokens: 10, outputTokens: 2 })
    expect(v.entries.at(-1)).toMatchObject({ kind: 'result', text: 'done' })
  })

  it('ignores heartbeats and unknown frames without changing the view', () => {
    const before = appendUser(emptyView, 'hi')
    expect(reduceFrame(before, { event: { heartbeat: true } })).toBe(before)
    expect(reduceFrame(before, item({ type: 'nope' }))).toBe(before)
    expect(reduceFrame(before, { done: true })).toBe(before)
  })

  it('records a top-level error and returns the turn to idle', () => {
    let v = reduceFrame(emptyView, item({ type: 'approval_request', requestId: 'r1' }))
    v = reduceFrame(v, { error: { code: 'agent_runtime_missing', message: 'bccli missing' } })
    expect(v.error).toBe('agent_runtime_missing')
    expect(v.pending).toBeNull()
    expect(v.turn).toBe('idle')
    expect(v.entries.at(-1)).toMatchObject({ kind: 'error', code: 'agent_runtime_missing' })
  })

  it('renders baseline messages in order and keeps the truncation count', () => {
    const v = baselineToView({ id: 's1', truncated: true, omittedCount: 3, messages: [
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: [{ type: 'text', text: 'Hai' }] },
    ] })
    expect(v.entries.map(e => e.kind)).toEqual(['user', 'text'])
    expect(v.entries[1]).toMatchObject({ text: 'Hai' })
    expect(v.turn).toBe('idle')
    expect(v.omitted).toBe(3)
  })
})
