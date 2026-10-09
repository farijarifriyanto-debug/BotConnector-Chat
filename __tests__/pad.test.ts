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
