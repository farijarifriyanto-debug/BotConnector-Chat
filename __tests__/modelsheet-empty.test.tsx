import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { ModelSheet } from '../src/components/ModelSheet'
import { useSettings } from '../src/store/settings'

// Regression test for design-audit finding 014:
// When no models exist at all, the empty state displayed "No model matches." even when the
// user had not typed any search query. It now distinguishes no-models-available from no-search-match.

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))

beforeEach(() => {
  useSettings.setState({ lang: 'en' })
})

describe('ModelSheet empty state distinction (finding 014)', () => {
  it('says no models are available when the list is empty without a search query', async () => {
    const r = await render(<ModelSheet visible models={[]} selected="" onSelect={() => {}} onClose={() => {}} />)
    expect(r.getByTestId('model-empty').props.children).toBe('No models are available right now.')
  })

  it('says no model matches when a search query filters out all models', async () => {
    const model = { id: 'm1', name: 'Gemini', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
    const r = await render(<ModelSheet visible models={[model]} selected="m1" onSelect={() => {}} onClose={() => {}} />)
    await fireEvent.changeText(r.getByTestId('model-search'), 'nonexistent')
    expect(r.getByTestId('model-empty').props.children).toBe('No model matches.')
  })

  it('respects the Indonesian translation for both states', async () => {
    useSettings.setState({ lang: 'id' })
    const r1 = await render(<ModelSheet visible models={[]} selected="" onSelect={() => {}} onClose={() => {}} />)
    expect(r1.getByTestId('model-empty').props.children).toBe('Belum ada model yang tersedia.')

    const model = { id: 'm1', name: 'Gemini', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
    const r2 = await render(<ModelSheet visible models={[model]} selected="m1" onSelect={() => {}} onClose={() => {}} />)
    await fireEvent.changeText(r2.getByTestId('model-search'), 'nonexistent')
    expect(r2.getByTestId('model-empty').props.children).toBe('Tidak ada model yang cocok.')
  })
})
