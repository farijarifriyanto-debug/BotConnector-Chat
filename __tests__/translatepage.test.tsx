import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { DEFAULT_TRANSLATE_PROMPT, translateText } from '../src/lib/translate'
import { TranslatePage } from '../src/components/TranslatePage'
import { TranslateSettingsSheet } from '../src/components/TranslateSettingsSheet'
import { useTranslate } from '../src/store/translate'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
const mockStream = jest.fn((_body?: unknown, _signal?: unknown) => (async function* (): AsyncGenerator<{ content?: string }> {})())
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/api/api', () => ({ ...jest.requireActual('../src/api/api'), streamCompletion: (...a: unknown[]) => mockStream(...a) }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: async () => {}, deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))

async function* chunks(...parts: string[]) { for (const p of parts) yield { content: p }; yield { finish: 'stop' } }
const model = (id: string, name: string) => ({ id, name, access: 'free' as const, vision: false, tools: false, reasoning: false, available: true })

describe('translateText', () => {
  it('sends one user message with the reference prompt, streams the answer and trims the first space', async () => {
    const onText = jest.fn()
    const stream = jest.fn((_body?: unknown, _signal?: unknown) => chunks('  Konnichiwa', ' desu'))
    const out = await translateText({ text: 'Halo', target: 'ja', model: 'm', onText }, { stream })
    expect(out).toBe('Konnichiwa desu')
    expect(onText).toHaveBeenNthCalledWith(1, 'Konnichiwa')
    const body = (stream.mock.calls[0] as unknown[])[0] as { model: string; messages: { role: string; content: string }[]; reasoning_effort?: string }
    expect(body.model).toBe('m')
    expect(body.reasoning_effort).toBe('none')
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[0].content).toContain('Japanese')
    expect(body.messages[0].content).toContain('Halo')
    expect(body.messages[0].content.startsWith('You are a translation expert')).toBe(true)
  })

  it('uses the person’s own prompt and lets a thinking model think when asked', async () => {
    const stream = jest.fn((_body?: unknown, _signal?: unknown) => chunks('ok'))
    await translateText({ text: 'Halo', target: 'en', model: 'm', prompt: 'Ke {target_lang}: {source_text}', think: true, onText: () => {} }, { stream })
    const body = (stream.mock.calls[0] as unknown[])[0] as { messages: { content: string }[]; reasoning_effort?: string }
    expect(body.messages[0].content).toBe('Ke English: Halo')
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('does nothing for an empty text, and keeps the default prompt when the saved one is blank', async () => {
    const stream = jest.fn((_body?: unknown, _signal?: unknown) => chunks('x'))
    expect(await translateText({ text: '   ', target: 'en', model: 'm', onText: () => {} }, { stream })).toBe('')
    expect(stream).not.toHaveBeenCalled()
    await translateText({ text: 'Halo', target: 'en', model: 'm', prompt: '  ', onText: () => {} }, { stream })
    expect(((stream.mock.calls[0] as unknown[])[0] as { messages: { content: string }[] }).messages[0].content.startsWith(DEFAULT_TRANSLATE_PROMPT.slice(0, 20))).toBe(true)
  })
})

describe('translate settings store', () => {
  it('remembers the target language, the prompt, the model and the thinking switch', () => {
    const s = () => useTranslate.getState()
    useTranslate.setState({ target: 'en' })
    expect(s().target).toBe('en')
    s().setTarget('ja'); s().setPrompt('Ke {target_lang}: {source_text}'); s().setModel('m2'); s().setThink(true)
    const storage = require('expo-sqlite/kv-store').default
    expect(storage.getItemSync('bc.translate.target')).toBe('ja')
    expect(storage.getItemSync('bc.translate.prompt')).toBe('Ke {target_lang}: {source_text}')
    expect(storage.getItemSync('bc.translate.model')).toBe('m2')
    expect(storage.getItemSync('bc.translate.think')).toBe('1')
  })
})

const start = (lang: 'en' | 'id' = 'en') => {
  useSettings.setState({ lang })
  useChat.setState({ models: [model('m', 'GLM 4.6'), model('m2', 'Kimi')], modelId: 'm' })
  useTranslate.setState({ target: 'id', prompt: '', model: null, think: false })
}

beforeEach(() => {
  jest.clearAllMocks(); start()
  ;(require('expo-clipboard').getStringAsync as jest.Mock).mockResolvedValue('teks dari papan klip')
})

describe('translate page', () => {
  it('translates the typed text, keeps the answer in the result box and copies it', async () => {
    mockStream.mockImplementation(() => chunks('Selamat ', 'pagi'))
    const r = await render(<TranslatePage visible onClose={() => {}} />)
    await fireEvent.changeText(r.getByTestId('tr-page-source'), 'Good morning')
    await fireEvent.press(r.getByTestId('tr-page-go'))
    await waitFor(() => expect(r.getByTestId('tr-page-result').props.value).toBe('Selamat pagi'))
    expect(mockStream.mock.calls[0][0]).toMatchObject({ model: 'm' })

    await fireEvent.press(r.getByTestId('tr-page-copy'))
    await waitFor(() => expect(require('expo-clipboard').setStringAsync).toHaveBeenCalledWith('Selamat pagi'))
  })

  it('picks a language, remembers it, and clears everything', async () => {
    mockStream.mockImplementation(() => chunks('こんにちは'))
    const r = await render(<TranslatePage visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('tr-page-lang'))
    await fireEvent.press(r.getByTestId('tr-page-lang-ja'))
    expect(useTranslate.getState().target).toBe('ja')

    await fireEvent.changeText(r.getByTestId('tr-page-source'), 'Halo')
    await fireEvent.press(r.getByTestId('tr-page-go'))
    await waitFor(() => expect(r.getByTestId('tr-page-result').props.value).toBe('こんにちは'))
    await fireEvent.press(r.getByTestId('tr-page-clear'))
    expect(r.getByTestId('tr-page-source').props.value).toBe('')
    expect(r.getByTestId('tr-page-result').props.value).toBe('')
  })

  it('pastes from the clipboard and shows the failure without losing the partial answer', async () => {
    mockStream.mockImplementation(() => { throw new Error('down') })
    const r = await render(<TranslatePage visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('tr-page-paste'))
    await waitFor(() => expect(r.getByTestId('tr-page-source').props.value).toBe('teks dari papan klip'))

    await fireEvent.press(r.getByTestId('tr-page-go'))
    await waitFor(() => expect(r.getByTestId('tr-page-error')).toBeTruthy())
  })

  it('turns the button into stop while it streams', async () => {
    let release: () => void = () => {}
    async function* slow() { yield { content: 'Se' }; await new Promise<void>(r => { release = r }); yield { content: 'lamat' }; yield { finish: 'stop' } }
    mockStream.mockImplementation(() => slow())
    const r = await render(<TranslatePage visible onClose={() => {}} />)
    await fireEvent.changeText(r.getByTestId('tr-page-source'), 'Hi')
    await fireEvent.press(r.getByTestId('tr-page-go'))
    await waitFor(() => expect(r.getByTestId('tr-page-stop')).toBeTruthy())
    await fireEvent.press(r.getByTestId('tr-page-stop'))
    release()
    await waitFor(() => expect(r.getByTestId('tr-page-go')).toBeTruthy())
  })
})

describe('translate settings', () => {
  it('chooses the translate model, edits the prompt and turns thinking on', async () => {
    const r = await render(<TranslateSettingsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('trs-model-m2'))
    expect(useTranslate.getState().model).toBe('m2')
    await fireEvent.changeText(r.getByTestId('trs-prompt'), 'Ke {target_lang}: {source_text}')
    expect(useTranslate.getState().prompt).toBe('Ke {target_lang}: {source_text}')
    expect(r.getByTestId('trs-reset')).toBeTruthy()
    await fireEvent.press(r.getByTestId('trs-reset'))
    expect(useTranslate.getState().prompt).toBe('')
    await fireEvent.press(r.getByTestId('trs-think'))
    expect(useTranslate.getState().think).toBe(true)
  })
})
