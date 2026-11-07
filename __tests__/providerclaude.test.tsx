import './helpers/mocks'
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ProvidersSheet } from '../src/components/ProvidersSheet'
import { useSettings } from '../src/store/settings'
import { useProviders } from '../src/store/providers'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
const qr = (value: unknown) => 'ai-provider:v1:' + btoa(JSON.stringify(value))

beforeEach(() => { useSettings.setState({ lang: 'en' }); useProviders.setState({ providers: [] }) })

describe('choosing the provider protocol (Anthropic native vs OpenAI-compatible)', () => {
  it('defaults manual entry to the OpenAI-compatible protocol', async () => {
    const r = await render(<ProvidersSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('provider-manual'))
    expect(r.getByTestId('prov-kind-openai').props.accessibilityState.selected).toBe(true)
    expect(r.getByTestId('prov-kind-claude').props.accessibilityState.selected).toBe(false)
  })
  it('a Claude QR selects the Anthropic protocol and the save sends it', async () => {
    const add = jest.spyOn(useProviders.getState(), 'add').mockResolvedValue({ ok: true })
    const r = await render(<ProvidersSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('provider-paste'))
    await fireEvent.changeText(r.getByTestId('provider-import-text'), qr({ type: 'claude', name: 'My Claude', apiKey: 'sk-ant-test' }))
    await fireEvent.press(r.getByTestId('provider-import-submit'))
    expect(r.getByTestId('prov-kind-claude').props.accessibilityState.selected).toBe(true)
    await fireEvent.changeText(r.getByTestId('prov-key'), 'sk-ant-test')
    await fireEvent.press(r.getByTestId('prov-save'))
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'anthropic', name: 'My Claude', baseUrl: 'https://api.anthropic.com/v1' }))
    add.mockRestore()
  })
  it('the protocol switch survives editing fields back and forth', async () => {
    const r = await render(<ProvidersSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('provider-manual'))
    await fireEvent.press(r.getByTestId('prov-kind-claude'))
    await fireEvent.press(r.getByTestId('prov-kind-openai'))
    expect(r.getByTestId('prov-kind-openai').props.accessibilityState.selected).toBe(true)
    await fireEvent.press(r.getByTestId('prov-kind-claude'))
    expect(r.getByTestId('prov-kind-claude').props.accessibilityState.selected).toBe(true)
  })
})
