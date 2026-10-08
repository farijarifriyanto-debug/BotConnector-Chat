import './helpers/mocks'
import { streamCompletion } from '../src/api/api'
import { configureEndpoints, customId, isPrivateHost, listRemoteModels, normalizeBaseUrl, parseCustomId } from '../src/api/custom'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status < 400, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body })
const sse = (chunks: string[]) => { const enc = new TextEncoder(); let i = 0; return { ok: true, status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) }, body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }), releaseLock() {} }) } } }

describe('custom provider addresses', () => {
  it('accepts https anywhere and http only on private networks', () => {
    expect(normalizeBaseUrl(' https://api.openai.com/v1/ ')).toEqual({ ok: true, url: 'https://api.openai.com/v1' })
    expect(normalizeBaseUrl('http://192.168.1.10:11434/v1')).toEqual({ ok: true, url: 'http://192.168.1.10:11434/v1' })
    expect(normalizeBaseUrl('http://localhost:1234/v1')).toMatchObject({ ok: true })
    expect(normalizeBaseUrl('http://api.example.com/v1')).toEqual({ ok: false, problem: 'https' })
    expect(normalizeBaseUrl('ftp://x.com')).toEqual({ ok: false, problem: 'url' })
    expect(normalizeBaseUrl('https://user:pw@host.com/v1')).toEqual({ ok: false, problem: 'url' })
    expect(normalizeBaseUrl('not a url')).toEqual({ ok: false, problem: 'url' })
  })
  it('knows which hosts are private', () => {
    for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.0.2', '100.100.1.1', 'mac.local', 'box.tail1234.ts.net']) expect(isPrivateHost(h)).toBe(true)
    for (const h of ['8.8.8.8', '172.32.0.1', '100.63.0.1', 'example.com']) expect(isPrivateHost(h)).toBe(false)
  })
  it('round-trips model ids that contain colons', () => {
    expect(parseCustomId(customId('abc', 'llama3:8b'))).toEqual({ providerId: 'abc', raw: 'llama3:8b' }); expect(parseCustomId('free-model')).toBeNull()
  })
})

describe('custom provider calls', () => {
  beforeEach(() => { mockFetch.mockReset(); configureEndpoints(async id => (id === 'p1' ? { baseUrl: 'https://llm.example/v1', apiKey: 'sk-test' } : null)) })

  it('lists models from OpenAI and Ollama shapes, sorted and de-duplicated, sending only the provider key', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }))
    expect(await listRemoteModels('https://llm.example/v1', 'sk-test')).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(mockFetch.mock.calls[0][1].headers.authorization).toBe('Bearer sk-test')
    mockFetch.mockResolvedValueOnce(reply(200, { models: [{ name: 'llama3:8b' }] }))
    expect(await listRemoteModels('http://10.0.0.2:11434/v1', '')).toEqual([{ id: 'llama3:8b' }])
    expect(mockFetch.mock.calls[1][1].headers.authorization).toBeUndefined()
  })
  it('reports a rejected key as badkey, not as a BotConnector sign-out', async () => {
    mockFetch.mockResolvedValueOnce(reply(401, {}))
    await expect(listRemoteModels('https://llm.example/v1', 'bad')).rejects.toMatchObject({ kind: 'badkey' })
  })
  it('streams through the provider with the raw model id and its own key', async () => {
    mockFetch.mockResolvedValueOnce(sse(['data: {"choices":[{"delta":{"content":"Ha"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\n\n']))
    const out: string[] = []
    for await (const d of streamCompletion({ model: customId('p1', 'gpt-x'), messages: [] })) if (d.content) out.push(d.content)
    expect(out.join('')).toBe('Halo')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://llm.example/v1/chat/completions'); expect(init.headers.authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-x', stream: true })
  })
  it('refuses a model whose provider was removed instead of falling back to BotConnector', async () => {
    await expect((async () => { for await (const _ of streamCompletion({ model: customId('gone', 'm'), messages: [] })) { /* none */ } })()).rejects.toMatchObject({ kind: 'rejected' })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
