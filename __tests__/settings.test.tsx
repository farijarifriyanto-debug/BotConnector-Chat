import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SettingsSheet } from '../src/components/SettingsSheet'
import { useProviders } from '../src/store/providers'
import { useLocal } from '../src/local/store'
import { useSettings } from '../src/store/settings'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.setTimeout(30000)
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{ui}</SafeAreaProvider>

beforeEach(() => {
  useSettings.setState({ lang: 'en' })
  useProviders.setState({ providers: [
    { id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-x' }], updatedAt: 1 },
    { id: 'p2', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: [{ id: 'llama' }], updatedAt: 1 },
  ] })
  useLocal.setState({ models: [{ id: 'local:q.gguf', name: 'Qwen', file: 'q.gguf', bytes: 1, addedAt: 1 }] })
})

describe('grouped settings (Kelivo layout, approved mockup)', () => {
  it('groups everything under General / Models & Services / Data / About', async () => {
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    expect(r.getByText('General')).toBeTruthy()
    expect(r.getByText('Models & Services')).toBeTruthy()
    expect(r.getByText('Data')).toBeTruthy()
    expect(r.getByText('About')).toBeTruthy()
    expect(r.getByTestId('open-providers')).toBeTruthy()   // AI access lives in Models & Services, near the top
    expect(r.getByTestId('open-caps')).toBeTruthy()
  })
  it('has no account surface: no sign-in, usage, laptop relay, logout or account deletion', async () => {
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    for (const id of ['guest-signin', 'guest-apple-signin', 'open-usage', 'open-laptop', 'logout', 'delete-account']) expect(r.queryByTestId(id)).toBeNull()
  })
  it('shows the current value on each row', async () => {
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    expect(r.getByTestId('val-language').props.children).toBe('English')
    expect([].concat(r.getByTestId('val-providers').props.children as never).join('')).toContain('2')   // two providers connected
    expect([].concat(r.getByTestId('val-local').props.children as never).join('')).toContain('1')        // one local model installed
    expect(r.getByTestId('val-search').props.children).toBe('BotConnector Search')
  })
  it('filters rows by the search box and says when nothing matches', async () => {
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    await fireEvent.changeText(r.getByTestId('settings-search'), 'back')
    expect(r.getByTestId('open-backup')).toBeTruthy()
    expect(r.queryByTestId('open-providers')).toBeNull()
    expect(r.queryByText('General')).toBeNull()   // group headers hide when their rows are filtered out
    await fireEvent.changeText(r.getByTestId('settings-search'), 'zzzzqq')
    expect(r.queryByTestId('open-backup')).toBeNull()
    expect(r.getByTestId('settings-no-results')).toBeTruthy()
  })
})

describe('model capabilities (audit E3 UI)', () => {
  it('marks a capability per model, persists it, and the picker reflects it', async () => {
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    await fireEvent.press(r.getByTestId('open-caps'))
    expect(r.getByTestId('caps-row-p1-gpt-x')).toBeTruthy()
    expect(r.getByTestId('cap-tools-p1-gpt-x').props.accessibilityState.selected).toBe(false)
    await fireEvent.press(r.getByTestId('cap-tools-p1-gpt-x'))
    expect(r.getByTestId('cap-tools-p1-gpt-x').props.accessibilityState.selected).toBe(true)
    const m = useProviders.getState().providers[0].models[0]
    expect(m.caps).toEqual({ tools: true })
    const { customModels } = require('../src/store/providers') as typeof import('../src/store/providers')
    expect(customModels()[0].tools).toBe(true)
    await fireEvent.press(r.getByTestId('cap-tools-p1-gpt-x'))   // toggles back off
    expect(customModels()[0].tools).toBe(false)
  })
  it('says what to do when no provider model exists yet', async () => {
    useProviders.setState({ providers: [] })
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    await fireEvent.press(r.getByTestId('open-caps'))
    expect(r.getByTestId('caps-empty')).toBeTruthy()
  })
})
