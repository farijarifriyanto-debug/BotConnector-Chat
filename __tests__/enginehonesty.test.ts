import './helpers/mocks'
import { runAssistant } from '../src/lib/agent'
import { DEVICE_TOOLS } from '../src/lib/tools/local'

const mockStream = jest.fn(), mockSearch = jest.fn()
jest.mock('../src/api/api', () => ({ streamCompletion: (...a: unknown[]) => mockStream(...a), webSearch: (...a: unknown[]) => mockSearch(...a), webFetch: jest.fn() }))

const model = { id: 'm', name: 'M', access: 'free' as const, tools: true, vision: false, reasoning: false, available: true }
const opts = () => ({ model, messages: [{ role: 'user' as const, content: 'hello' }], web: false, fileIds: [], tools: DEVICE_TOOLS, onTool: jest.fn(async () => 'executed'), onText: () => {}, onReasoning: () => {}, onStatus: () => {} })
async function* call(name: string, args = '{}') { yield { toolCalls: [{ index: 0, id: 'c1', name, args }] }; yield { finish: 'tool_calls' } }
async function* answer() { yield { content: 'answer' }; yield { finish: 'stop' } }

beforeEach(() => { mockStream.mockReset(); mockSearch.mockReset() })

describe('tool dispatch honesty (audit E1)', () => {
  it('refuses a tool call the model was never offered instead of executing it', async () => {
    mockStream.mockImplementationOnce(() => call('memory_update', '{"content":"unrequested memory"}')).mockImplementationOnce(() => answer())
    const o = opts()
    const r = await runAssistant(o)
    expect(o.tools.some(x => x.function.name === 'memory_update')).toBe(false)   // only device tools were offered
    expect(o.onTool).not.toHaveBeenCalled()                                      // the unrequested memory write must not run
    const followUp = mockStream.mock.calls[1][0].messages
    const toolMsg = followUp[followUp.length - 1]
    expect(toolMsg.role).toBe('tool'); expect(String(toolMsg.content)).toMatch(/not available/i)
    expect(r.content).toBe('answer')
  })
  it('still executes a tool that was offered', async () => {
    mockStream.mockImplementationOnce(() => call('get_time_info')).mockImplementationOnce(() => answer())
    const o = opts()
    await runAssistant(o)
    expect(o.onTool).toHaveBeenCalledWith('get_time_info', {})
  })
  it('refuses search_web when web search is off and its tools were not offered', async () => {
    mockStream.mockImplementationOnce(() => call('search_web', '{"query":"x"}')).mockImplementationOnce(() => answer())
    const o = opts()
    await runAssistant(o)
    expect(mockSearch).not.toHaveBeenCalled()
    const followUp = mockStream.mock.calls[1][0].messages
    expect(String(followUp[followUp.length - 1].content)).toMatch(/not available/i)
  })
})

describe('search failure honesty (audit E4)', () => {
  it('tells the model when the first search failed instead of hiding it', async () => {
    mockSearch.mockRejectedValue(new Error('offline')); mockStream.mockImplementation(() => answer())
    const o = { ...opts(), web: true }
    const r = await runAssistant(o)
    expect(r.content).toBe('answer'); expect(r.sources).toEqual([])
    const sent = JSON.stringify(mockStream.mock.calls[0][0].messages)
    expect(sent).toMatch(/search (failed|unavailable|could not)/i)
  })
})
