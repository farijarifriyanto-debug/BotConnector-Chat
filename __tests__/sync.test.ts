import './helpers/mocks'
import { configureSync, enableSync, markDeleted, runSync, toDoc } from '../src/sync/chatSync'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const mockDb = new Map<string, any>()
jest.mock('../src/db/convs', () => ({ listConvs: async () => [...mockDb.values()], getConv: async (id: string) => mockDb.get(id) ?? null, putConv: async (c: any) => { mockDb.set(c.id, c) }, deleteConv: async (id: string) => { mockDb.delete(id) } }))
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })
const conv = (id: string, over: Record<string, unknown> = {}) => ({ id, title: id, model: 'm', system: '', web: false, createdAt: 1, updatedAt: 100, messages: [{ id: 'u' + id, role: 'user', content: 'hai', createdAt: 1 }], ...over })

describe('account chat sync', () => {
  beforeEach(async () => { mockFetch.mockReset(); mockDb.clear(); configureSync(() => 'sess-token'); await enableSync() })

  it('sends the app session as the cookie and strips image bytes and device file paths', () => {
    const doc = toDoc(conv('a', { messages: [{ id: 'm1', role: 'user', content: 'x', createdAt: 1, attachments: [{ kind: 'image', name: 'f', mime: 'image/png', size: 1, dataUrl: 'data:AAA', uri: 'images/x.png' }] }] }) as never)
    expect(JSON.stringify(doc)).not.toContain('data:AAA'); expect(JSON.stringify(doc)).not.toContain('images/x.png')
  })
  it('pulls remote chats, pushes dirty local ones, and never pushes a private (local) chat', async () => {
    mockDb.set('mine', conv('mine')); mockDb.set('secret', conv('secret', { local: true }))
    mockFetch.mockImplementation(async (url: string) => (url.includes('/changes')
      ? json({ items: [{ id: 'remote1', rev: 1, doc: { title: 'Dari web', updatedAt: 500, createdAt: 400, messages: [{ id: 'r1', role: 'assistant', content: 'halo', createdAt: 450 }] } }], cursor: 5, more: false, usage: { items: 1, bytes: 10, max_items: 1000, max_bytes: 100 } })
      : json({ ok: true })))
    const st = await runSync()
    expect(st.phase).toBe('idle'); expect(mockDb.get('remote1')?.title).toBe('Dari web')
    const puts = mockFetch.mock.calls.filter(c => String(c[0]).endsWith('/put'))
    expect(puts.map(c => JSON.parse(c[1].body).id)).toEqual(['mine'])
    for (const c of mockFetch.mock.calls) expect(c[1].headers.cookie).toBe('__Host-bc-app=sess-token')
    expect(puts[0][1].headers.origin).toBe('https://app.botconnector.id')
  })
  it('sends tombstones for deleted chats and reports a refused request honestly', async () => {
    markDeleted('gone')
    mockFetch.mockImplementation(async (url: string) => (url.includes('/changes') ? json({ items: [], cursor: 1, more: false, usage: { items: 0, bytes: 0, max_items: 1, max_bytes: 1 } }) : json({ ok: true })))
    await runSync()
    expect(mockFetch.mock.calls.some(c => String(c[0]).endsWith('/delete') && JSON.parse(c[1].body).id === 'gone')).toBe(true)
    mockFetch.mockReset(); mockFetch.mockResolvedValue(json({ error: { code: 'ORIGIN_REJECTED' } }, 403))
    expect((await runSync()).phase).toBe('rejected')
    mockFetch.mockReset(); mockFetch.mockResolvedValue(json({}, 401))
    expect((await runSync()).phase).toBe('auth')
  })
})
