import './helpers/mocks'
import { runAssistant } from '../src/lib/agent'
import { MEMORY_TOOLS } from '../src/lib/tools/local'

const mockStream = jest.fn(), mockSearch = jest.fn()
jest.mock('../src/api/api', () => ({ streamCompletion: (...a: unknown[]) => mockStream(...a), webSearch: (...a: unknown[]) => mockSearch(...a), webFetch: jest.fn() }))

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: true, reasoning: false, available: true }
const opts = (over: Record<string, unknown> = {}) => ({
  model, messages: [{ role: 'user' as const, content: 'ingat ya saya suka kopi' }], web: false, fileIds: [],
  tools: MEMORY_TOOLS, onTool: jest.fn(async () => '{"saved":true}'),
  onText: () => {}, onReasoning: () => {}, onStatus: () => {}, ...over,
})

async function* toolCall() { yield { toolCalls: [{ index: 0, id: 'call_1', name: 'memory_update', args: '{"content":"Suka kopi"}' }] }; yield { finish: 'tool_calls' } }
async function* answer(text: string) { yield { content: text }; yield { finish: 'stop' } }

beforeEach(() => { mockStream.mockReset(); mockSearch.mockReset() })

describe('local tool calls', () => {
  it('offers Memory tools even when web search is off, and feeds the result back', async () => {
    mockStream.mockImplementationOnce(() => toolCall()).mockImplementationOnce(() => answer('Sudah saya catat.'))
    const o = opts()
    const r = await runAssistant(o)

    const first = mockStream.mock.calls[0][0] as { tools?: { function: { name: string } }[] }
    expect(first.tools?.map(t => t.function.name)).toEqual(['memory_read', 'memory_update', 'memory_edit', 'memory_delete'])
    expect(o.onTool).toHaveBeenCalledWith('memory_update', { content: 'Suka kopi' })

    const second = mockStream.mock.calls[1][0] as { messages: { role: string; tool_call_id?: string; content: unknown }[] }
    expect(second.messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"saved":true}' })
    expect(r.content).toBe('Sudah saya catat.')
  })

  it('keeps answering when a local tool fails', async () => {
    mockStream.mockImplementationOnce(() => toolCall()).mockImplementationOnce(() => answer('Gagal mencatat, tapi ini jawabannya.'))
    const o = opts({ onTool: jest.fn(async () => { throw new Error('storage down') }) })
    const r = await runAssistant(o)
    expect(r.content).toContain('jawabannya')
    expect(mockStream.mock.calls[1][0].messages.at(-1).content).toContain('unavailable')
  })

  it('sends no tools when the caller passes none', async () => {
    mockStream.mockImplementation(() => answer('halo'))
    await runAssistant(opts({ tools: [], onTool: undefined }))
    expect((mockStream.mock.calls[0][0] as { tools?: unknown[] }).tools).toBeUndefined()
  })
})
