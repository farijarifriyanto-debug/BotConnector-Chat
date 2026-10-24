import './helpers/mocks'
import { CITATION_PROMPT, PAGE_SIZE, runAssistant, windowPage } from '../src/lib/agent'

const mockStream = jest.fn(), mockSearch = jest.fn(), mockFetch = jest.fn()
jest.mock('../src/api/api', () => ({
  streamCompletion: (...a: unknown[]) => mockStream(...a),
  webSearch: (...a: unknown[]) => mockSearch(...a),
  webFetch: (...a: unknown[]) => mockFetch(...a),
}))

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: true, reasoning: false, available: true }
async function* answer(text: string) { yield { content: text }; yield { finish: 'stop' } }
async function* toolCall(name: string, args: unknown) { yield { toolCalls: [{ index: 0, id: 'c1', name, args: JSON.stringify(args) }] }; yield { finish: 'tool_calls' } }
const opts = (over: Record<string, unknown> = {}) => ({
  model, messages: [{ role: 'user' as const, content: 'harga vps' }], web: false, fileIds: [],
  onText: () => {}, onReasoning: () => {}, onStatus: () => {}, ...over,
})
const sysOf = (call: number) => (mockStream.mock.calls[call][0] as { messages: { role: string; content: string }[] }).messages
const lastTool = (call = 1) => sysOf(call).at(-1)!.content

beforeEach(() => { mockStream.mockReset(); mockSearch.mockReset(); mockFetch.mockReset() })

describe('search_web', () => {
  it('returns JSON items with sequential index and a short stable id per URL', async () => {
    mockSearch.mockResolvedValue([
      { title: 'VPS A', url: 'https://a.example/x', snippet: 'Rp50rb' },
      { title: 'VPS B', url: 'https://b.example/y', snippet: 'Rp60rb' },
    ])
    mockStream.mockImplementationOnce(() => toolCall('search_web', { query: 'vps murah' })).mockImplementationOnce(() => answer('ok'))
    const r = await runAssistant(opts())

    const body = JSON.parse(lastTool())
    expect(body.items.map((i: { index: number }) => i.index)).toEqual([1, 2])
    const ids = body.items.map((i: { id: string }) => i.id)
    expect(ids[0]).toMatch(/^r[0-9a-f]{6}$/)
    expect(new Set(ids).size).toBe(2)
    expect(body.items[0]).toMatchObject({ title: 'VPS A', url: 'https://a.example/x', text: 'Rp50rb' })
    expect(body.answer).toBeUndefined()
    expect(r.sources[0]).toEqual({ title: 'VPS A', url: 'https://a.example/x', id: ids[0] })
  })

  it('keeps the same id when the same page comes back again, and does not duplicate the source', async () => {
    mockSearch.mockResolvedValue([{ title: 'A', url: 'https://a.example/x', snippet: 'first' }])
    mockStream
      .mockImplementationOnce(() => toolCall('search_web', { query: 'one' })).mockImplementationOnce(() => toolCall('search_web', { query: 'two' })).mockImplementationOnce(() => answer('ok'))
    const r = await runAssistant(opts())
    const first = JSON.parse(lastTool(1)).items[0].id
    const second = JSON.parse(lastTool(2)).items[0].id
    expect(second).toBe(first)
    expect(r.sources).toHaveLength(1)
  })
})

describe('fetch_url', () => {
  it('returns a 10.000 character window with next_start_index and honours start_index', async () => {
    const content = 'x'.repeat(PAGE_SIZE) + 'tail'
    mockFetch.mockResolvedValue({ title: 'Page', text: content })
    mockStream.mockImplementationOnce(() => toolCall('fetch_url', { url: 'https://a.example/x' })).mockImplementationOnce(() => answer('ok'))
    await runAssistant(opts({ web: true, fetchMode: 'local' }))

    const first = JSON.parse(lastTool(1))
    expect(first).toEqual({ url: 'https://a.example/x', title: 'Page', content: 'x'.repeat(PAGE_SIZE), total_length: content.length, next_start_index: PAGE_SIZE })

    mockStream.mockReset()
    mockStream.mockImplementationOnce(() => toolCall('fetch_url', { url: 'https://a.example/x', start_index: PAGE_SIZE })).mockImplementationOnce(() => answer('ok'))
    await runAssistant(opts({ web: true, fetchMode: 'local' }))
    expect(JSON.parse(lastTool(1))).toEqual({ url: 'https://a.example/x', title: 'Page', content: 'tail', total_length: content.length })
  })

  it('never cuts a surrogate pair in half', () => {
    const content = 'a'.repeat(PAGE_SIZE - 1) + '😀' + 'b'
    const page = windowPage('https://a.example', 't', content, 0)
    expect(page.content.length).toBe(PAGE_SIZE - 1)
    expect(page.next_start_index).toBe(PAGE_SIZE - 1)
    expect(page.content).not.toContain('\ud83d')
    expect(windowPage('https://a.example', 't', content, PAGE_SIZE - 1).content).toBe('😀b')
  })

  it('refuses to read pages when the setting is off', async () => {
    mockStream.mockImplementationOnce(() => toolCall('fetch_url', { url: 'https://a.example/x' })).mockImplementationOnce(() => answer('ok'))
    await runAssistant(opts({ web: true, fetchMode: 'off' }))
    expect(JSON.parse(lastTool(1))).toEqual({ error: 'Reading web pages is turned off' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('reads through the page reader the caller passes (follow search)', async () => {
    const readOwn = jest.fn(async () => ({ title: 'Own', text: 'from my provider' }))
    mockStream.mockImplementationOnce(() => toolCall('fetch_url', { url: 'https://a.example/x' })).mockImplementationOnce(() => answer('ok'))
    await runAssistant(opts({ web: true, fetchMode: 'follow', fetchPage: readOwn }))
    expect(readOwn).toHaveBeenCalledWith('https://a.example/x', undefined)
    expect(JSON.parse(lastTool(1)).content).toBe('from my provider')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('citations', () => {
  it('sends the citation prompt when web is on, before the auto-search results', async () => {
    mockSearch.mockResolvedValue([{ title: 'A', url: 'https://a.example/x', snippet: 's' }])
    mockStream.mockImplementation(() => answer('ok'))
    await runAssistant(opts({ web: true }))
    const messages = sysOf(0)
    expect(messages[0]).toEqual({ role: 'system', content: CITATION_PROMPT })
    expect(messages[0].content).toContain('<citations>')
    expect(messages[1].content).toContain('"id":"r')
  })

  it('sends no citation prompt when web is off', async () => {
    mockStream.mockImplementation(() => answer('ok'))
    await runAssistant(opts())
    expect(JSON.stringify(sysOf(0))).not.toContain('<citations>')
  })
})
