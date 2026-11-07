import './helpers/mocks'
import { streamCompletion, type Delta } from '../src/api/api'
import { customId } from '../src/api/custom'
import { decodeProviderImport } from '../src/lib/providerImport'
import { useProviders } from '../src/store/providers'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockVault = new Map<string, string>()
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async (k: string) => mockVault.get(k) ?? null, setItemAsync: async (k: string, v: string) => { mockVault.set(k, v) }, deleteItemAsync: async (k: string) => { mockVault.delete(k) } }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status < 400, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body })
const sse = (chunks: string[]) => { const enc = new TextEncoder(); let i = 0; return { ok: true, status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) }, body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }), releaseLock() {} }) } } }

const EVENTS = [
  'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"get_time_info"}}\n\n',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"tz\\":\\"Asia\\/Jakarta\\"}"}}\n\n',
  'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}\n\n',
  'data: {"type":"message_stop"}\n\n',
]

beforeEach(() => { mockFetch.mockReset(); mockVault.clear(); useProviders.setState({ providers: [] }) })

describe('a Claude QR becomes a working BYOK provider end to end (node)', () => {
  it('imports the Kelivo share format type "claude" as a native-Anthropic provider', () => {
    const c = decodeProviderImport('ai-provider:v1:' + btoa(JSON.stringify({ type: 'claude', name: 'Claude Langsung', apiKey: 'sk-ant-test' })))
    expect(c).toEqual({ name: 'Claude Langsung', apiKey: 'sk-ant-test', baseUrl: 'https://api.anthropic.com/v1', kind: 'anthropic' })
    expect(decodeProviderImport('ai-provider:v1:' + btoa(JSON.stringify({ type: 'anthropic' }))).kind).toBe('anthropic')   // tolerate the alias
  })
  it('stores the kind, lists models with native headers, and streams chat through /messages', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [{ type: 'model', id: 'claude-x', display_name: 'Claude X' }] }))
    expect(await useProviders.getState().add({ name: 'MyClaude', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', manualModels: '', kind: 'anthropic' })).toEqual({ ok: true })
    const p = useProviders.getState().providers.find(x => x.name === 'MyClaude')!
    expect(p.kind).toBe('anthropic'); expect(p.models.map(m => m.id)).toEqual(['claude-x'])
    expect(mockFetch.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-test')

    mockFetch.mockResolvedValueOnce(sse(EVENTS))
    const deltas: Delta[] = []
    for await (const d of streamCompletion({ model: customId(p.id, 'claude-x'), messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'time?' }] })) deltas.push(d)
    const [url, init] = mockFetch.mock.calls[1]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
    expect(init.headers['anthropic-version']).toBeTruthy()
    const sent = JSON.parse(init.body)
    expect(sent.model).toBe('claude-x'); expect(sent.system).toBe('be brief'); expect(sent.max_tokens).toBeGreaterThanOrEqual(1)
    expect(sent.messages).toEqual([{ role: 'user', content: 'time?' }])

    expect(deltas.some(d => d.content === 'Hi')).toBe(true)
    expect(deltas.some(d => d.toolCalls?.some(t => t.name === 'get_time_info'))).toBe(true)
    expect(deltas.some(d => d.toolCalls?.some(t => t.args === '{"tz":"Asia/Jakarta"}'))).toBe(true)
    expect(deltas.some(d => d.finish === 'tool_calls')).toBe(true)
    expect(deltas.some(d => d.usage?.output === 7)).toBe(true)

    useProviders.getState().remove(p.id)
  })
  it('reports an Anthropic auth failure as badkey instead of a cloud sign-out', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [] }))
    await useProviders.getState().add({ name: 'C', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', manualModels: 'claude-x', kind: 'anthropic' })
    const p = useProviders.getState().providers.find(x => x.name === 'C')!
    mockFetch.mockResolvedValueOnce(reply(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
    await expect((async () => { for await (const _ of streamCompletion({ model: customId(p.id, 'claude-x'), messages: [] })) { /* none */ } })()).rejects.toMatchObject({ kind: 'badkey' })
    useProviders.getState().remove(p.id)
  })
  it('surfaces an in-stream error event instead of hanging', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [] }))
    await useProviders.getState().add({ name: 'C2', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', manualModels: 'claude-x', kind: 'anthropic' })
    const p = useProviders.getState().providers.find(x => x.name === 'C2')!
    mockFetch.mockResolvedValueOnce(sse(['data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n']))
    await expect((async () => { for await (const _ of streamCompletion({ model: customId(p.id, 'claude-x'), messages: [] })) { /* none */ } })()).rejects.toMatchObject({ kind: 'unavailable' })
    useProviders.getState().remove(p.id)
  })
})
