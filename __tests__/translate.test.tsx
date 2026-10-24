import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { buildPrompt, DEFAULT_TRANSLATE_PROMPT, LANGUAGES, languageName } from '../src/lib/translate'
import { MessageView } from '../src/components/MessageView'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'
import { ChatError, type Msg } from '../src/lib/types'
import { newConv } from '../src/lib/conv'

jest.setTimeout(30000)
const mockStream = jest.fn(), mockPut = jest.fn(async (_c: unknown) => {})
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}) }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: (c: unknown) => mockPut(c), deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/api/api', () => ({ ...jest.requireActual('../src/api/api'), streamCompletion: (...a: unknown[]) => mockStream(...a) }))

async function* chunks(...parts: string[]) { for (const p of parts) yield { content: p }; yield { finish: 'stop' } }

describe('translation prompt and languages', () => {
  it('fills the reference prompt with the target language and the text', () => {
    expect(DEFAULT_TRANSLATE_PROMPT).toContain('{target_lang}')
    expect(DEFAULT_TRANSLATE_PROMPT).toContain('{source_text}')
    const prompt = buildPrompt('', 'Indonesian', 'Halo dunia')
    expect(prompt).toContain('Indonesian')
    expect(prompt).toContain('Halo dunia')
    expect(prompt).not.toContain('{target_lang}')
    expect(buildPrompt('Ke {target_lang}: {source_text}', 'English', 'Halo')).toBe('Ke English: Halo')
    expect(buildPrompt('   ', 'English', 'Halo')).toBe(prompt.replace('Indonesian', 'English').replace('Halo dunia', 'Halo'))
  })

  it('offers the reference languages with their English names', () => {
    expect(LANGUAGES).toHaveLength(18)
    expect(LANGUAGES.map(l => l.code)).toContain('id')
    expect(languageName('id')).toBe('Indonesian')
    expect(languageName('zh-CN')).toBe('Simplified Chinese')
    expect(languageName('xx')).toBe('xx')
  })
})

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: true, available: true }
const answer = (over: Partial<Msg> = {}): Msg => ({ id: 'a1', role: 'assistant', content: 'Good morning everyone', createdAt: Date.now(), model: 'M', ...over })
const start = (msgs: Msg[]) => useChat.setState({ models: [model], modelId: 'm', convs: [{ ...newConv('m'), id: 'c1', title: 't', messages: msgs }], activeId: 'c1', draft: null, busy: false } as never)

describe('translating a message', () => {
  beforeEach(() => { mockStream.mockReset(); mockPut.mockClear(); useSettings.setState({ lang: 'en' }) })

  it('streams the translation into the message and saves it', async () => {
    start([answer()])
    mockStream.mockImplementation(() => chunks('Selamat ', 'pagi semuanya'))
    const r = await useChat.getState().translateMessage('a1', 'id')
    expect(r).toEqual({ ok: true })

    const sent = mockStream.mock.calls[0][0] as { model: string; messages: { role: string; content: string }[]; reasoning_effort?: string }
    expect(sent.model).toBe('m')
    expect(sent.reasoning_effort).toBe('none')                 // translation never thinks first
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0].role).toBe('user')
    expect(sent.messages[0].content).toContain('Indonesian')
    expect(sent.messages[0].content).toContain('Good morning everyone')

    expect(useChat.getState().convs[0].messages[0].translation).toBe('Selamat pagi semuanya')
    expect(mockPut).toHaveBeenCalled()
  })

  it('clears the card when the service fails, and says so', async () => {
    start([answer()])
    mockStream.mockImplementation(() => { throw new ChatError('unavailable') })
    const r = await useChat.getState().translateMessage('a1', 'id')
    expect(r).toEqual({ ok: false, kind: 'unavailable' })
    expect(useChat.getState().convs[0].messages[0].translation).toBeUndefined()
  })

  it('can clear a translation', async () => {
    start([answer({ translation: 'Selamat pagi' })])
    useChat.getState().clearTranslation('a1')
    await waitFor(() => expect(useChat.getState().convs[0].messages[0].translation).toBeUndefined())
  })
})

const props = { streaming: false, status: null, isLastAssistant: true, canAct: true, onRegenerate: () => {} }

describe('the translation card', () => {
  beforeEach(() => useSettings.setState({ lang: 'en', msgMeta: false }))

  it('stays collapsed for a saved translation and opens on tap', async () => {
    const r = await render(<MessageView msg={answer({ translation: 'Selamat pagi semuanya' })} {...props} />)
    expect(r.getByTestId('translation-card')).toBeTruthy()
    expect(r.queryByText('Selamat pagi semuanya')).toBeNull()
    await fireEvent.press(r.getByTestId('translation-toggle'))
    expect(r.getByText('Selamat pagi semuanya')).toBeTruthy()
  })

  it('shows the translating hint and opens by itself when the words arrive', async () => {
    const r = await render(<MessageView msg={answer({ translation: '' })} {...props} />)
    expect(r.getByText('Translating…')).toBeTruthy()
    await r.rerender(<MessageView msg={answer({ translation: 'Selamat pagi' })} {...props} />)
    expect(r.getByText('Selamat pagi')).toBeTruthy()
  })

  it('asks for a language, then translates; a saved translation can be cleared', async () => {
    const onTranslate = jest.fn(async () => ({ ok: true }))
    const onClearTranslation = jest.fn()
    const r = await render(<MessageView msg={answer({ translation: 'Selamat pagi' })} {...props} onTranslate={onTranslate} onClearTranslation={onClearTranslation} />)
    await fireEvent.press(r.getByTestId('translate-open'))
    await fireEvent.press(r.getByTestId('tr-lang-id'))
    expect(onTranslate).toHaveBeenCalledWith('id')

    await fireEvent.press(r.getByTestId('translate-open'))
    await fireEvent.press(r.getByTestId('tr-clear'))
    expect(onClearTranslation).toHaveBeenCalled()
  })
})
