import './helpers/mocks'
import { byokSearch } from '../src/api/search'
import { configureApi, webSearch } from '../src/api/api'
import { searchByok, useSearch } from '../src/store/search'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })

describe('BYOK web search', () => {
  beforeEach(() => { mockFetch.mockReset(); configureApi({ token: () => 'bc-token', onUnauthorized: () => {} }) })
  it('shapes Brave and Tavily results and sends only the provider key to the provider', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { web: { results: [{ title: 'A', url: 'https://a.example', description: 'da' }, { title: 'bad', url: 'javascript:x' }] } }))
    expect(await byokSearch('brave', 'k1', 'harga beras', 5)).toEqual([{ title: 'A', url: 'https://a.example', snippet: 'da' }])
    expect(mockFetch.mock.calls[0][0]).toContain('api.search.brave.com'); expect(mockFetch.mock.calls[0][1].headers['x-subscription-token']).toBe('k1')
    mockFetch.mockResolvedValueOnce(reply(200, { results: [{ title: 'T', url: 'https://t.example', content: 'ct' }] }))
    expect((await byokSearch('tavily', 'k2', 'q', 3))[0].snippet).toBe('ct')
    expect(mockFetch.mock.calls[1][1].headers.authorization).toBe('Bearer k2')
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain('bc-token')
  })
  it('a wrong key is reported as badkey', async () => {
    mockFetch.mockResolvedValueOnce(reply(401, {}))
    await expect(byokSearch('exa', 'bad', 'q', 5)).rejects.toMatchObject({ kind: 'badkey' })
    await expect(byokSearch('exa', '  ', 'q', 5)).rejects.toMatchObject({ kind: 'badkey' })
  })
  it('uses BotConnector Search when no key is set, and when the own provider fails', async () => {
    useSearch.setState({ provider: 'brave' })
    expect(await searchByok('q')).toBeNull()                       // chosen provider but no key saved
    mockFetch.mockResolvedValueOnce(reply(200, { results: [{ title: 'BC', url: 'https://bc.example', snippet: 's' }] }))
    expect((await webSearch('q'))[0].title).toBe('BC')
    expect(String(mockFetch.mock.calls[0][0])).toContain('/v1/web/search')
  })
})
