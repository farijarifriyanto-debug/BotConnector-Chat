import './helpers/mocks'
import Storage from 'expo-sqlite/kv-store'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-web-browser', () => ({}))
const mockSecureMem = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 1,
  getItemAsync: async (k: string) => mockSecureMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { mockSecureMem.set(k, v) },
  deleteItemAsync: async (k: string) => { mockSecureMem.delete(k) },
}))
const mockDb = new Map<string, unknown>()
const mockClearConvs = jest.fn(async () => {})
jest.mock('../src/db/convs', () => ({
  listConvs: async () => [...mockDb.values()], getConv: async (id: string) => mockDb.get(id) ?? null,
  putConv: async (c: { id: string }) => { mockDb.set(c.id, c) }, deleteConv: async (id: string) => { mockDb.delete(id) },
  clearConvs: async () => { await mockClearConvs() },
}))
jest.mock('../src/auth/session', () => {
  const real = jest.requireActual('../src/auth/session')
  return { ...real, fetchAccount: jest.fn() }
})

import { saveSession, clearSession, type Session } from '../src/auth/session'
import { enableSync, loadState } from '../src/sync/chatSync'
import { migrateToStandalone } from '../src/lib/standalone'
import { useAuth } from '../src/store/auth'
import { useChat } from '../src/store/chat'
import { useProviders } from '../src/store/providers'
import { useLocal } from '../src/local/store'
import { newConv } from '../src/lib/conv'
import * as api from '../src/api/api'

const session: Session = { sessionToken: 'sess', accessToken: 'acc', userId: 'u1', expiresAt: Date.now() + 1e7 }
const conv = (id: string, over: Record<string, unknown> = {}) => ({ ...newConv('m'), id, title: id, createdAt: 1, updatedAt: 1, messages: [], ...over })

beforeEach(() => {
  mockSecureMem.clear(); mockDb.clear(); mockClearConvs.mockClear()
  try { Storage.removeItemSync('bc.standalone.v1') } catch { /* none */ }
  try { Storage.removeItemSync('bc.guest') } catch { /* none */ }
})

describe('standalone migration', () => {
  it('drops the account session and turns sync off without touching chats, providers or keys', async () => {
    await saveSession(session)
    await enableSync()
    mockDb.set('c1', conv('c1', { messages: [{ id: 'm1', role: 'user', content: 'keep me', createdAt: 1 }] }))
    await migrateToStandalone()
    expect(mockSecureMem.get('bc.session.v1') ?? null).toBeNull()   // the old credential is gone
    expect(loadState().enabled).toBe(false)                     // sync metadata off, no purge
    expect(mockDb.has('c1')).toBe(true)                         // chats stay
    expect(mockClearConvs).not.toHaveBeenCalled()               // never the data-wiping logout path
  })
  it('is safe to run again and again', async () => {
    await saveSession(session)
    await migrateToStandalone(); await migrateToStandalone()
    expect(mockSecureMem.get('bc.session.v1') ?? null).toBeNull()
    expect(loadState().enabled).toBe(false)
  })
})

describe('standalone startup', () => {
  it('init never restores an old account session and never asks the account service', async () => {
    await saveSession(session)
    await useAuth.getState().init()
    expect(useAuth.getState().status).toBe('guest')
    expect(useAuth.getState().session).toBeNull()
    expect(useAuth.getState().account).toBeNull()
    expect(jest.requireMock('../src/auth/session').fetchAccount as jest.Mock).not.toHaveBeenCalled()
  })
})

describe('a chat whose model is gone', () => {
  it('says so and waits for a model pick instead of silently switching provider', async () => {
    useAuth.setState({ status: 'guest', session: null, account: null })
    useProviders.setState({ providers: [{ id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-x' }], updatedAt: 1 }] })
    useLocal.setState({ models: [] })
    await useChat.getState().loadModels()
    const old = conv('old1', { model: 'bc-cloud-model-gone', messages: [{ id: 'u1', role: 'user', content: 'earlier', createdAt: 1 }] })
    useChat.setState({ convs: [old], activeId: 'old1', draft: null })
    const spy = jest.spyOn(api, 'streamCompletion')
    await useChat.getState().send('hai lagi', { web: false, research: false })
    const msgs = (useChat.getState().convs.find(c => c.id === 'old1')!).messages
    const last = msgs[msgs.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.error).toBe('model')
    expect(last.content).toBe('')
    expect(spy).not.toHaveBeenCalled()   // nothing was sent to the picker model behind the user's back
    spy.mockRestore()
  })
})
