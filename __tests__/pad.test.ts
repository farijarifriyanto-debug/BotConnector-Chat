import { PadGuard, PAD_KEEP, PAD_RUNAWAY } from '../src/lib/pad'
import { padGuard, streamCompletion } from '../src/api/api'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock

describe('PadGuard', () => {
  it('passes normal text and tables untouched', () => {
    const g = new PadGuard(), t = '| Fitur | Harga |\n|---|---|\n| A | 10 |\n'
    const a = g.feed(t.slice(0, 20)), b = g.feed(t.slice(20))
    expect(a.out + b.out).toBe(t.trimEnd()); expect(a.stop || b.stop).toBe(false)
  })
  it('holds trailing blanks back and releases them only when text follows', () => {
    const g = new PadGuard()
    expect(g.feed('| Fitur   ')).toEqual({ out: '| Fitur', stop: false })
    expect(g.feed('  ')).toEqual({ out: '', stop: false })
    expect(g.feed('|')).toEqual({ out: '     |', stop: false })
  })
  it('squeezes absurd padding inside a row but keeps ordinary alignment', () => {
    const g = new PadGuard()
    expect(g.feed(`| a${' '.repeat(40)}| b${' '.repeat(500)}|`).out).toBe(`| a${' '.repeat(40)}| b${' '.repeat(PAD_KEEP)}|`)
  })
  it('stops when the model only produces blanks, however they are split into chunks', () => {
    const g = new PadGuard(); let stopped = false, shown = ''
    g.feed('| Fitur |')
    for (let i = 0; i < 400 && !stopped; i++) { const r = g.feed(i % 7 === 0 ? '\n      ' : '          '); shown += r.out; stopped = r.stop }
    expect(stopped).toBe(true); expect(shown).toBe('')
    expect(PAD_RUNAWAY).toBeGreaterThan(300)
  })
  it('a long blank gap inside the answer is not a runaway once text resumes', () => {
    const g = new PadGuard()
    expect(g.feed('a' + ' '.repeat(1000)).stop).toBe(false)
    const r = g.feed('b'); expect(r.stop).toBe(false); expect(r.out).toBe(`${' '.repeat(PAD_KEEP)}b`)
  })
  it('applies to content and reasoning separately', () => {
    const g = { text: new PadGuard(), thought: new PadGuard() }
    expect(padGuard({ content: 'x', reasoning: ' '.repeat(PAD_RUNAWAY + 1) }, g)).toBe(true)
    expect(padGuard({ content: 'ok' }, { text: new PadGuard(), thought: new PadGuard() })).toBe(false)
  })
})

function sse(frames: object[], extra = ''): Response {
  const enc = new TextEncoder(), parts = frames.map(f => `data: ${JSON.stringify(f)}\n\n`)
  let i = 0, cancelled = false
  const body = { getReader: () => ({ read: async () => (i < parts.length && !cancelled ? { done: false, value: enc.encode(parts[i++]) } : { done: true, value: undefined }), cancel: async () => { cancelled = true }, releaseLock: () => {} }) }
  return { ok: true, status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) }, body, extra } as unknown as Response
}
const delta = (content: string) => ({ choices: [{ delta: { content } }] })

describe('streamCompletion with a model stuck in blanks', () => {
  it('cuts the stream, keeps the text before the padding and reports finish=length', async () => {
    const frames = [delta('Ringkasan. '), delta('| Fitur'), ...Array.from({ length: 300 }, () => delta('          ')), delta('should never arrive')]
    mockFetch.mockResolvedValueOnce(sse(frames))
    let text = '', finish = ''
    for await (const d of streamCompletion({ model: 'gemini-2.5-flash-lite', messages: [] })) { if (d.content) text += d.content; if (d.finish) finish = d.finish }
    expect(text).toBe('Ringkasan. | Fitur'); expect(finish).toBe('length')
  })
  it('lets a normal answer through unchanged', async () => {
    mockFetch.mockResolvedValueOnce(sse([delta('Halo '), delta('dunia'), { choices: [{ delta: {}, finish_reason: 'stop' }] }]))
    let text = '', finish = ''
    for await (const d of streamCompletion({ model: 'x', messages: [] })) { if (d.content) text += d.content; if (d.finish) finish = d.finish }
    expect(text).toBe('Halo dunia'); expect(finish).toBe('stop')
  })
})

describe('quiet retry of transient failures', () => {
  const { withRetry, retryDelay } = require('../src/api/api') as typeof import('../src/api/api')
  const { ChatError } = require('../src/lib/types') as typeof import('../src/lib/types')
  beforeEach(() => { jest.useFakeTimers(); mockFetch.mockReset() })
  afterEach(() => jest.useRealTimers())
  it('retries network, unavailable and short capacity waits; never auth, balance or long waits', () => {
    expect(retryDelay(new ChatError('unavailable'), 0)).toBe(700)
    expect(retryDelay(new ChatError('network'), 1)).toBe(1800)
    expect(retryDelay(new ChatError('network'), 2)).toBeNull()
    expect(retryDelay(new ChatError('capacity', { retryAfterSeconds: 3 }), 0)).toBe(3000)
    expect(retryDelay(new ChatError('capacity', { retryAfterSeconds: 60 }), 0)).toBeNull()
    for (const k of ['auth', 'balance', 'plan', 'too_large', 'rejected', 'privacy', 'aborted'] as const) expect(retryDelay(new ChatError(k), 0)).toBeNull()
    expect(retryDelay(new Error('boom'), 0)).toBeNull()
  })
  it('withRetry succeeds after a blip and gives up after two retries', async () => {
    const ok = jest.fn().mockRejectedValueOnce(new ChatError('unavailable')).mockResolvedValueOnce('fine')
    const p = withRetry(ok); await jest.advanceTimersByTimeAsync(800); await expect(p).resolves.toBe('fine'); expect(ok).toHaveBeenCalledTimes(2)
    const dead = jest.fn().mockRejectedValue(new ChatError('network'))
    const q = withRetry(dead); const out = expect(q).rejects.toMatchObject({ kind: 'network' }); await jest.advanceTimersByTimeAsync(5000); await out
    expect(dead).toHaveBeenCalledTimes(3)
  })
  it('a stream that fails before any text is retried; one that fails mid-answer is not', async () => {
    const bad = (status: number) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}) }) as unknown as Response
    mockFetch.mockResolvedValueOnce(bad(502)).mockResolvedValueOnce(sse([delta('Halo'), delta(' dunia')]))
    const run = (async () => { let t = ''; for await (const d of streamCompletion({ model: 'x', messages: [] })) if (d.content) t += d.content; return t })()
    await jest.advanceTimersByTimeAsync(800); await expect(run).resolves.toBe('Halo dunia'); expect(mockFetch).toHaveBeenCalledTimes(2)

    mockFetch.mockReset()
    const dying = { ok: true, status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) }, body: { getReader: () => { let n = 0; return { read: async () => { if (n++ === 0) return { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(delta('Sebagian'))}\n\n`) }; throw new Error('link dropped') }, cancel: async () => {}, releaseLock: () => {} } } } } as unknown as Response
    mockFetch.mockResolvedValueOnce(dying)
    const run2 = (async () => { let t = ''; try { for await (const d of streamCompletion({ model: 'x', messages: [] })) if (d.content) t += d.content } catch (e) { return `${t}|${(e as { kind?: string }).kind}` } return t })()
    await jest.advanceTimersByTimeAsync(5000); await expect(run2).resolves.toBe('Sebagian|network'); expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
