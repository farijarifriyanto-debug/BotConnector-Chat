import './helpers/mocks'
import { customModels, useProviders } from '../src/store/providers'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }))

const provider = (models: { id: string; name?: string; caps?: { tools?: boolean; vision?: boolean; reasoning?: boolean } }[]) => ({ id: 'p1', name: 'P', baseUrl: 'https://llm.example/v1', models, updatedAt: 0 })

beforeEach(() => { useProviders.setState({ providers: [] }) })

describe('per-model capability metadata (audit E3)', () => {
  it('custom models default to no capabilities until the user marks them', () => {
    useProviders.setState({ providers: [provider([{ id: 'a' }])] })
    const [a] = customModels()
    expect([a.tools, a.vision, a.reasoning]).toEqual([false, false, false])
  })
  it('honours capability metadata stored on the model', () => {
    useProviders.setState({ providers: [provider([{ id: 'a' }, { id: 'b', caps: { tools: true, vision: true } }])] })
    const [a, b] = customModels()
    expect([a.tools, a.vision, a.reasoning]).toEqual([false, false, false])
    expect([b.tools, b.vision, b.reasoning]).toEqual([true, true, false])
  })
  it('persists capability changes through the store action', async () => {
    useProviders.setState({ providers: [provider([{ id: 'a' }, { id: 'b' }])] })
    await useProviders.getState().setModelCaps('p1', 'a', { tools: true })
    await useProviders.getState().setModelCaps('p1', 'b', { vision: true, reasoning: true })
    const [a, b] = customModels()
    expect(a.tools).toBe(true); expect(a.vision).toBe(false)
    expect([b.tools, b.vision, b.reasoning]).toEqual([false, true, true])
    const Storage = (require('expo-sqlite/kv-store') as { default: { getItemSync: (k: string) => string | null } }).default
    const saved = JSON.parse(Storage.getItemSync('bc.providers.v1') ?? '[]')
    expect(saved[0].models.find((m: { id: string }) => m.id === 'a').caps).toEqual({ tools: true })
    expect(saved[0].models.find((m: { id: string }) => m.id === 'b').caps).toEqual({ vision: true, reasoning: true })
  })
  it('updates only the named capability and keeps the others', async () => {
    useProviders.setState({ providers: [provider([{ id: 'a', caps: { tools: true, vision: true } }])] })
    await useProviders.getState().setModelCaps('p1', 'a', { tools: false })
    const [a] = customModels()
    expect([a.tools, a.vision]).toEqual([false, true])
  })
})
