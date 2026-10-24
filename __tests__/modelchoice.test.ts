import './helpers/mocks'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'
import type { Conv } from '../src/lib/types'

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => ({ execAsync: async () => {}, runAsync: async () => {}, getAllAsync: async () => [], getFirstAsync: async () => null })) }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

const conv = (id: string, model: string): Conv => ({ id, title: id, model, system: '', web: false, createdAt: 1, updatedAt: 1, messages: [] })

beforeEach(() => {
  useChat.setState({ convs: [conv('a', 'model-a'), conv('b', 'model-b')], activeId: null, draft: null, modelId: 'model-a', busy: false })
  useSettings.setState({ model: 'model-a' })
})

describe('choosing the AI', () => {
  it('opening a chat shows the model that chat actually uses', () => {
    useChat.getState().open('b')
    expect(useChat.getState().modelId).toBe('model-b')
    expect(useChat.getState().activeId).toBe('b')
  })

  it('picking a model applies to the open chat, the settings and the next draft alike', () => {
    useChat.getState().open('a')
    useChat.getState().selectModel('model-z')
    const s = useChat.getState()
    expect(s.modelId).toBe('model-z')
    expect(s.convs.find(c => c.id === 'a')?.model).toBe('model-z')
    expect(s.convs.find(c => c.id === 'b')?.model).toBe('model-b')   // other chats keep their own
    expect(useSettings.getState().model).toBe('model-z')             // a new chat starts with it
  })

  it('picking a model with no chat open only changes the next chat', () => {
    useChat.getState().selectModel('model-y')
    const s = useChat.getState()
    expect(s.modelId).toBe('model-y')
    expect(s.convs.every(c => c.model !== 'model-y')).toBe(true)
    expect(useSettings.getState().model).toBe('model-y')
  })
})
