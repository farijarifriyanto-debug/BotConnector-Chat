import './helpers/mocks'
import { useProviders, customModels } from '../src/store/providers'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const mockVault = new Map<string, string>()
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async (k: string) => mockVault.get(k) ?? null, setItemAsync: async (k: string, v: string) => { mockVault.set(k, v) }, deleteItemAsync: async (k: string) => { mockVault.delete(k) } }))
const ok = (data: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data })

describe('provider store', () => {
  beforeEach(() => { mockFetch.mockReset(); mockVault.clear(); useProviders.setState({ providers: [] }) })

  it('adds a provider, keeps the key only in secure storage and exposes its models', async () => {
    mockFetch.mockResolvedValueOnce(ok({ data: [{ id: 'gpt-x' }, { id: 'gpt-y' }] }))
    expect(await useProviders.getState().add({ name: 'OpenAI', baseUrl: 'https://api.openai.com/v1/', apiKey: ' sk-secret ', manualModels: '' })).toEqual({ ok: true })
    const [p] = useProviders.getState().providers
    expect(JSON.stringify(p)).not.toContain('sk-secret'); expect([...mockVault.values()]).toEqual(['sk-secret'])
    expect(customModels().map(m => [m.name, m.provider, m.access, m.tools])).toEqual([['gpt-x', 'OpenAI', 'custom', false], ['gpt-y', 'OpenAI', 'custom', false]])
    expect(customModels()[0].id.startsWith('custom:')).toBe(true)
  })
  it('rejects a bad address and a rejected key without saving anything', async () => {
    expect(await useProviders.getState().add({ name: 'X', baseUrl: 'http://evil.example/v1', apiKey: '', manualModels: '' })).toEqual({ ok: false, reason: 'https' })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) })
    expect(await useProviders.getState().add({ name: 'X', baseUrl: 'https://x.example/v1', apiKey: 'bad', manualModels: 'm1' })).toEqual({ ok: false, reason: 'badkey' })
    expect(useProviders.getState().providers).toEqual([]); expect(mockVault.size).toBe(0)
  })
  it('falls back to typed model ids when the list cannot be loaded, and removing wipes the key', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    expect(await useProviders.getState().add({ name: 'Home', baseUrl: 'http://192.168.1.5:11434/v1', apiKey: '', manualModels: 'llama3, qwen3' })).toEqual({ ok: true })
    expect(customModels().map(m => m.name)).toEqual(['llama3', 'qwen3'])
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    expect(await useProviders.getState().add({ name: 'Empty', baseUrl: 'https://z.example/v1', apiKey: 'k', manualModels: '' })).toEqual({ ok: false, reason: 'network' })
    const id = useProviders.getState().providers[0].id
    mockVault.set(`bc.pk.${id}`, 'k'); await useProviders.getState().remove(id)
    expect(mockVault.size).toBe(0); expect(useProviders.getState().providers).toEqual([])
  })
})
