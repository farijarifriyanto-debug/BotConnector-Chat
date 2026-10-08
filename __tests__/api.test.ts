import { classify, drainSse, parseChunk } from '../src/api/api'

describe('SSE parsing', () => {
  it('splits complete events and keeps the unfinished tail', () => {
    const { payloads, rest } = drainSse('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b"')
    expect(payloads).toEqual(['{"a":1}']); expect(rest).toBe('data: {"b"')
  })
  it('reads content, reasoning, tool calls and the finish reason', () => {
    expect(parseChunk(JSON.stringify({ choices: [{ delta: { content: 'hi', reasoning_content: 'hm' }, finish_reason: null }] }))).toEqual({ content: 'hi', reasoning: 'hm' })
    expect(parseChunk(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'web_search', arguments: '{"q' } }] } }] }))?.toolCalls).toEqual([{ index: 0, id: 'c1', name: 'web_search', args: '{"q' }])
    expect(parseChunk(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }))).toEqual({ finish: 'stop' })
    expect(parseChunk('not json')).toBeNull(); expect(parseChunk('{"choices":[]}')).toBeNull()
  })
})

describe('classify', () => {
  it('maps statuses and codes to a kind the UI can explain', () => {
    expect(classify(401, undefined).kind).toBe('auth'); expect(classify(402, undefined).kind).toBe('balance'); expect(classify(429, undefined, 7)).toMatchObject({ kind: 'capacity', retryAfterSeconds: 7 })
    expect(classify(403, 'free_model_requires_plan').kind).toBe('plan'); expect(classify(413, undefined).kind).toBe('too_large'); expect(classify(503, undefined).kind).toBe('unavailable'); expect(classify(400, 'bad').kind).toBe('rejected')
  })
})
