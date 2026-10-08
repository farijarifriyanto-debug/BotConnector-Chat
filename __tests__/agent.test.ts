import './helpers/mocks'
import { runAssistant } from '../src/lib/agent'

const mockStream = jest.fn(), mockSearch = jest.fn()
jest.mock('../src/api/api', () => ({ streamCompletion: (...a: unknown[]) => mockStream(...a), webSearch: (...a: unknown[]) => mockSearch(...a), webFetch: jest.fn() }))
async function* answer(text: string) { yield { content: text }; yield { finish: 'stop' } }
const model = (tools: boolean) => ({ id: 'm', name: 'M', access: 'free' as const, vision: false, tools, reasoning: false, available: true })
const opts = (tools: boolean, web = true) => ({ model: model(tools), messages: [{ role: 'user' as const, content: 'cari harga vps murah' }], web, fileIds: [], onText: () => {}, onReasoning: () => {}, onStatus: () => {} })

describe('web search mode', () => {
  beforeEach(() => { mockStream.mockReset(); mockSearch.mockReset() })
  it('searches with the question first even when the model could use tools, so it does not just ask for details', async () => {
    mockSearch.mockResolvedValue([{ title: 'VPS A', url: 'https://a.example', snippet: 'Rp50rb, 8GB RAM' }])
    mockStream.mockImplementation(() => answer('Hasilnya [1]'))
    const r = await runAssistant(opts(true))
    expect(mockSearch).toHaveBeenCalledWith('cari harga vps murah', undefined)
    const sent = mockStream.mock.calls[0][0] as { messages: { role: string; content: string }[]; tools?: unknown[] }
    expect(sent.messages[0].role).toBe('system'); expect(sent.messages[0].content).toContain('VPS A'); expect(sent.tools?.length).toBe(2)   // tools stay available for more searching
    expect(r.sources).toEqual([{ title: 'VPS A', url: 'https://a.example' }]); expect(r.queries).toEqual(['cari harga vps murah'])
  })
  it('does not search when web is off, and still answers when the search fails', async () => {
    mockStream.mockImplementation(() => answer('ok'))
    await runAssistant(opts(true, false)); expect(mockSearch).not.toHaveBeenCalled()
    mockSearch.mockRejectedValue(new Error('down'))
    expect((await runAssistant(opts(false))).content).toBe('ok')
  })
})
