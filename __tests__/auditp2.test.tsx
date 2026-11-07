import './helpers/mocks'
import { render } from '@testing-library/react-native'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PersonalizationSheet } from '../src/components/PersonalizationSheet'
import { STRINGS } from '../src/i18n/strings'
import { MEMORY_ID, MEMORY_ITEM_MAX, MEMORY_MAX, SYSTEM_MAX } from '../src/lib/conv'
import { MEMORY_MAX as TOOL_MEMORY_MAX } from '../src/lib/tools/local'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'
import { useTranslate } from '../src/store/translate'

const mockStream = jest.fn()
jest.mock('../src/api/api', () => ({ ...jest.requireActual('../src/api/api'), streamCompletion: (...a: unknown[]) => mockStream(...a), webSearch: jest.fn(), webFetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.setTimeout(30000)

const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{ui}</SafeAreaProvider>
const model = (id: string) => ({ id, name: id.toUpperCase(), access: 'free' as const, tools: true, vision: false, reasoning: false, available: true })
const answer = (text: string) => async function* () { yield { content: text } }

beforeEach(() => {
  mockStream.mockReset()
  useSettings.setState({ lang: 'en' })
  useTranslate.setState({ target: 'en', prompt: '', model: null, think: false })
  useChat.setState({
    convs: [{ id: 'c1', title: 'T', model: 'm', system: '', web: false, createdAt: 1, updatedAt: 1, messages: [{ id: 'm1', role: 'user', content: 'hello there', createdAt: 1 }] }],
    activeId: 'c1', models: [model('m'), model('tr')], modelId: 'm',
  } as never)
})
const memoryRec = () => useChat.getState().convs.find(c => c.id === MEMORY_ID)

describe('translation settings reach chat answers (audit E6)', () => {
  it('translates with the model chosen in translation settings', async () => {
    useTranslate.setState({ model: 'tr' })
    mockStream.mockImplementationOnce(answer('Halo'))
    expect(await useChat.getState().translateMessage('m1', 'id')).toEqual({ ok: true })
    expect(mockStream.mock.calls[0][0].model).toBe('tr')
  })
  it('keeps the chat model when translation settings say "default"', async () => {
    mockStream.mockImplementationOnce(answer('Halo'))
    await useChat.getState().translateMessage('m1', 'id')
    expect(mockStream.mock.calls[0][0].model).toBe('m')
  })
  it('uses the custom prompt and honours the thinking switch', async () => {
    useTranslate.setState({ prompt: 'Translate to {target_lang}: {source_text}' })
    mockStream.mockImplementationOnce(answer('Halo'))
    await useChat.getState().translateMessage('m1', 'id')
    const body = mockStream.mock.calls[0][0]
    expect(body.messages[0].content).toBe('Translate to Indonesian: hello there')
    expect(body.reasoning_effort).toBe('none')
    useTranslate.setState({ think: true })
    mockStream.mockImplementationOnce(answer('Halo'))
    await useChat.getState().translateMessage('m1', 'id')
    expect(mockStream.mock.calls[1][0].reasoning_effort).toBeUndefined()
  })
  it('the settings page says those settings cover chat answers too', () => {
    expect(STRINGS.en.trScopeNote).toMatch(/chat/i)
    expect(STRINGS.id.trScopeNote).toBeTruthy()
  })
})

describe('memory limits are one set of numbers (audit E7)', () => {
  it('the personalization form uses the shared limits', async () => {
    const r = await render(wrap(<PersonalizationSheet visible onClose={() => {}} />))
    expect(r.getByTestId('personal-note').props.maxLength).toBe(MEMORY_ITEM_MAX)
    expect(r.getByTestId('personal-system').props.maxLength).toBe(SYSTEM_MAX)
    expect(TOOL_MEMORY_MAX).toBe(MEMORY_MAX)   // the memory tools store under the same cap
  })
  it('the store enforces the limits for every writer, keeping the newest facts', async () => {
    const many = Array.from({ length: MEMORY_MAX + 20 }, (_, i) => `fact ${i}`)
    await useChat.getState().saveMemory({ memory: many })
    expect(memoryRec()?.memory?.length).toBe(MEMORY_MAX)
    expect(memoryRec()?.memory?.[0]).toBe('fact 20')
    await useChat.getState().saveMemory({ memory: ['x'.repeat(MEMORY_ITEM_MAX + 50)] })
    expect(memoryRec()?.memory?.[0]).toHaveLength(MEMORY_ITEM_MAX)
    await useChat.getState().saveMemory({ system: 'y'.repeat(SYSTEM_MAX + 100) })
    expect(memoryRec()?.system).toHaveLength(SYSTEM_MAX)
  })
  it('the note no longer claims the AI never adds memory', () => {
    expect(STRINGS.en.memoryNote).toMatch(/Memory tools/)
    expect(STRINGS.id.memoryNote).toMatch(/[Tt]ool [Mm]emori/)
  })
})
