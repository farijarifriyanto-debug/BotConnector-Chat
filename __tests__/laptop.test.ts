import './helpers/mocks'
import { streamCompletion } from '../src/api/api'
import { configureLaptop, laptopId, parseLaptopId } from '../src/laptop/api'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })
const sse = (chunks: string[]) => { const enc = new TextEncoder(); let i = 0; return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }), releaseLock() {} }) } } }

describe('laptop (BotConnector Local) transport', () => {
  beforeEach(() => { mockFetch.mockReset(); configureLaptop(() => 'tok') })
  it('round-trips ids whose model name has colons and slashes', () => {
    expect(parseLaptopId(laptopId('dev1', 'ollama', 'library/llama3:8b'))).toEqual({ deviceId: 'dev1', runtime: 'ollama', model: 'library/llama3:8b' })
    expect(parseLaptopId('free-model')).toBeNull()
  })
  it('loads the model when it is not in memory, then streams the laptop\'s answer', async () => {
    const calls: string[] = []
    mockFetch.mockImplementation(async (url: string, init: { body?: string }) => {
      calls.push(url.replace(/^.*\/v1\/client\/devices/, ''))
      if (url.endsWith('/request')) {
        const m = JSON.parse(init.body!).method
        return json({ result: m === 'models.list' ? [{ id: 'llama3', name: 'Llama 3', runtime: 'ollama' }] : m === 'runtime.status' ? { loadedModels: [] } : { ok: true } })
      }
      return sse(['data: {"event":{"delta":"Ha"}}\n\n', 'data: {"event":{"delta":"lo"}}\n\ndata: {"done":true,"result":{"content":"Halo"}}\n\n'])
    })
    const out: string[] = []
    for await (const d of streamCompletion({ model: laptopId('dev1', 'ollama', 'llama3'), messages: [{ role: 'user', content: 'hai' }] })) if (d.content) out.push(d.content)
    expect(out.join('')).toBe('Halo')                       // the final result is not repeated when deltas already arrived
    expect(calls.filter(c => c === '/dev1/request').length).toBe(3)   // models.list, runtime.status, model.load
    expect(calls.at(-1)).toBe('/dev1/stream')
    expect(mockFetch.mock.calls.every(c => c[1].headers.authorization === 'Bearer tok')).toBe(true)
  })
  it('reports a model that is no longer on the laptop, and never falls back to the cloud', async () => {
    mockFetch.mockImplementation(async (url: string, init: { body?: string }) => json({ result: JSON.parse(init.body!).method === 'models.list' ? [] : {} }))
    await expect((async () => { for await (const _ of streamCompletion({ model: laptopId('dev1', 'ollama', 'gone'), messages: [] })) { /* none */ } })()).rejects.toMatchObject({ kind: 'unavailable' })
    expect(mockFetch.mock.calls.every(c => String(c[0]).includes('/v1/client/devices/'))).toBe(true)
  })
})
