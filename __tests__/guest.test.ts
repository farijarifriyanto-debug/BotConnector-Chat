import './helpers/mocks'
import { useAuth } from '../src/store/auth'
import { useChat } from '../src/store/chat'
import { useProviders } from '../src/store/providers'
import { useLocal } from '../src/local/store'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///docs/' }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock

describe('using the app without a BotConnector account', () => {
  it('lists only own-provider and on-device models and never calls BotConnector', async () => {
    useAuth.setState({ status: 'guest', session: null, account: null })
    useProviders.setState({ providers: [{ id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-x' }], updatedAt: 1 }] })
    useLocal.setState({ models: [{ id: 'local:q.gguf', name: 'Qwen', file: 'q.gguf', bytes: 1, addedAt: 1 }] })
    await useChat.getState().loadModels()
    const s = useChat.getState()
    expect(s.models.map(m => m.access).sort()).toEqual(['custom', 'local'])
    expect(s.imageModels).toEqual([]); expect(s.modelsState).toBe('ready'); expect(s.modelId).not.toBe('')
    expect(mockFetch).not.toHaveBeenCalled()
  })
  it('keeps the guest choice and clears it when signing in succeeds or out', () => {
    useAuth.getState().continueAsGuest(); expect(useAuth.getState().status).toBe('guest')
  })
})
