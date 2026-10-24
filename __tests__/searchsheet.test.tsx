import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { SearchSheet } from '../src/components/SearchSheet'
import { useSearch } from '../src/store/search'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))

beforeEach(() => {
  useSearch.setState({ provider: 'botconnector', webFetch: 'follow' })
  useSettings.setState({ lang: 'en' })
})

describe('web page reading setting', () => {
  it('offers follow / local / off and keeps the choice', async () => {
    const r = await render(<SearchSheet visible onClose={() => {}} />)
    expect(r.getByText('Reading web pages')).toBeTruthy()
    expect(r.getByTestId('web-fetch-follow').props.accessibilityState.selected).toBe(true)
    expect(r.getByText('Follow search')).toBeTruthy()

    await fireEvent.press(r.getByTestId('web-fetch-off'))
    expect(useSearch.getState().webFetch).toBe('off')
    expect(r.getByTestId('web-fetch-off').props.accessibilityState.selected).toBe(true)
    expect(r.getByTestId('web-fetch-follow').props.accessibilityState.selected).toBe(false)

    await fireEvent.press(r.getByTestId('web-fetch-local'))
    expect(useSearch.getState().webFetch).toBe('local')
  })
})
