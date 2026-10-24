import './helpers/mocks'
import { parseChunk, parseUsage } from '../src/api/api'
import { runAssistant } from '../src/lib/agent'
import { newConv } from '../src/lib/conv'
import { useChat } from '../src/store/chat'

jest.setTimeout(30000)
const mockStream = jest.fn((_body?: unknown, _signal?: unknown) => (async function* (): AsyncGenerator<{ content?: string; usage?: unknown }> {})())
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: jest.fn(async () => {}), deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/api/api', () => ({ ...jest.requireActual('../src/api/api'), streamCompletion: (...a: unknown[]) => mockStream(...a) }))

const usageFrame = JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_tokens_details: { cached_tokens: 40 } } })

describe('the provider token report', () => {
  it('reads the usage frame that carries no choices', () => {
    expect(parseChunk(usageFrame)).toEqual({ usage: { input: 120, output: 30, cached: 40, total: 150 } })
  })

  it('reads usage attached to a normal chunk, and a cost the service may add', () => {
    const frame = JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 }, botconnector: { cost_micros: 1234, currency: 'USD' } })
    const d = parseChunk(frame)!
    expect(d.content).toBe('ok')
    expect(d.usage).toEqual({ input: 5, output: 2, total: 7 })
    expect(d.cost).toEqual({ micros: 1234, currency: 'USD' })
    expect(parseChunk(JSON.stringify({ choices: [{ delta: { content: 'x' } }] }))?.usage).toBeUndefined()
    expect(parseUsage({})).toBeNull()
  })
})

describe('an answer keeps what it cost', () => {
  const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }

  it('runAssistant reports the last usage frame', async () => {
    mockStream.mockImplementation(() => (async function* () { yield { content: 'halo' }; yield { usage: { input: 10, output: 4, total: 14 } }; yield { finish: 'stop' } })())
    const r = await runAssistant({ model, messages: [{ role: 'user', content: 'hai' }], web: false, fileIds: [], onText: () => {}, onReasoning: () => {}, onStatus: () => {} } as never)
    expect(r.usage).toEqual({ input: 10, output: 4, total: 14 })
  })

  it('the chat store saves the tokens on the answer', async () => {
    useChat.setState({ models: [model], modelId: 'm', convs: [], activeId: null, draft: newConv('m'), busy: false, caps: { files: false, web: true } } as never)
    mockStream.mockImplementation(() => (async function* () { yield { content: 'Selamat pagi' }; yield { usage: { input: 100, output: 20, cached: 30, total: 120 } }; yield { finish: 'stop' } })())
    await useChat.getState().send('halo', { web: false, research: false })
    const answer = useChat.getState().convs[0].messages.find(m => m.role === 'assistant')!
    expect(answer).toMatchObject({ promptTokens: 100, completionTokens: 20, cachedTokens: 30, totalTokens: 120 })
  })
})
