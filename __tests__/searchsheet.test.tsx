import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { SearchSheet } from '../src/components/SearchSheet'
import { useSearch } from '../src/store/search'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock

beforeEach(() => {
  mockFetch.mockReset()
  useSearch.setState({ provider: 'brave', webFetch: 'follow' })
  useSettings.setState({ lang: 'en' })
})

describe('web search without any cloud lane', () => {
  it('lists only the user providers; BotConnector is not a choice', async () => {
    const r = await render(<SearchSheet visible onClose={() => {}} />)
    expect(r.queryByTestId('srch-botconnector')).toBeNull()
    expect(r.getByTestId('srch-brave').props.accessibilityState.selected).toBe(true)
    await fireEvent.press(r.getByTestId('srch-tavily'))
    expect(useSearch.getState().provider).toBe('tavily')
    expect(r.getByTestId('srch-tavily').props.accessibilityState.selected).toBe(true)
  })
  it('a key can be saved and the test runs against the provider only', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ web: { results: [{ title: 'T', url: 'https://a.example', description: 'd' }] } }) })
    const r = await render(<SearchSheet visible onClose={() => {}} />)
    await fireEvent.changeText(r.getByTestId('srch-key'), 'k1')
    await fireEvent.press(r.getByTestId('srch-test'))
    expect((r.getByTestId('srch-result').props.children as string).startsWith('Works')).toBe(true)
    expect(String(mockFetch.mock.calls[0][0])).toContain('brave')
  })
})

describe('web page reading setting', () => {
  it('offers follow / off and keeps the choice; the cloud reader is gone', async () => {
    const r = await render(<SearchSheet visible onClose={() => {}} />)
    expect(r.getByText('Reading web pages')).toBeTruthy()
    expect(r.getByTestId('web-fetch-follow').props.accessibilityState.selected).toBe(true)
    expect(r.getByText('Follow search')).toBeTruthy()

    await fireEvent.press(r.getByTestId('web-fetch-off'))
    expect(useSearch.getState().webFetch).toBe('off')
    expect(r.getByTestId('web-fetch-off').props.accessibilityState.selected).toBe(true)
    expect(r.getByTestId('web-fetch-follow').props.accessibilityState.selected).toBe(false)
    expect(r.queryByTestId('web-fetch-local')).toBeNull()
  })
})
