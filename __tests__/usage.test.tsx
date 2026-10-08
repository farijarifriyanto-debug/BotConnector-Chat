import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { UsageSheet } from '../src/components/UsageSheet'
import { configureApi, fetchUsage } from '../src/api/api'
import { barColor, money, timeLeft } from '../src/lib/usage'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })
const summary = { plan: 'pro', quota: { windows: { fiveHour: { used_percent: 82.4, resets_at: new Date(Date.now() + 95 * 60000).toISOString() }, weekly: { used_percent: 10, resets_at: null }, monthly: { used_percent: 99.9, resets_at: null } } }, payg: { currency: 'USD', balance_micros: 5_250_000, reserved_micros: 250_000, available_micros: 5_000_000, monthly_spend_limit_micros: 20_000_000, current_period_spend_micros: 1_500_000 } }

describe('usage', () => {
  beforeEach(() => { mockFetch.mockReset(); configureApi({ token: () => 'tok', onUnauthorized: () => {} }) })
  it('helpers: time left, money, bar colour', () => {
    expect(timeLeft('2026-01-01T02:35:00Z', Date.parse('2026-01-01T00:00:00Z'))).toEqual({ d: 0, h: 2, m: 35 })
    expect(timeLeft('2026-01-03T00:00:30Z', Date.parse('2026-01-01T00:00:00Z'))).toEqual({ d: 2, h: 0, m: 1 })
    expect(timeLeft(null)).toBeNull(); expect(timeLeft('nonsense')).toBeNull()
    expect(money(5_000_000, 'usd')).toBe('USD 5.00'); expect(money(150_000_000, 'IDR')).toBe('IDR 150')
    expect([barColor(10), barColor(80), barColor(97)]).toEqual(['accent', 'payg', 'danger'])
  })
  it('reads the summary the server sends and ignores what it does not understand', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, summary))
    const u = await fetchUsage()
    expect(u.plan).toBe('pro'); expect(u.windows.fiveHour?.percent).toBe(82.4); expect(u.windows.monthly?.percent).toBe(99.9); expect(u.payg).toMatchObject({ currency: 'USD', available: 5_000_000, spendLimit: 20_000_000 })
    mockFetch.mockResolvedValueOnce(reply(200, { plan: 5, quota: { windows: { fiveHour: { used_percent: 400 } } }, payg: null }))
    const odd = await fetchUsage(); expect(odd.plan).toBe(''); expect(odd.windows.fiveHour?.percent).toBe(100); expect(odd.payg.available).toBe(0)
  })
  it('shows percentages for plan windows and the PAYG balance', async () => {
    mockFetch.mockResolvedValue(reply(200, summary))
    const r = await render(<UsageSheet visible onClose={() => {}} />)
    await waitFor(() => expect(r.getByTestId('usage-fiveHour')).toBeTruthy())
    expect(r.getByText('82% used')).toBeTruthy(); expect(r.getByText('100% used')).toBeTruthy(); expect(r.getByText('Pro')).toBeTruthy()
    expect(r.getByTestId('usage-payg')).toBeTruthy(); expect(r.getByText('USD 5.00')).toBeTruthy()
  })
  it('says so when the server cannot be reached, and retries on request', async () => {
    mockFetch.mockResolvedValueOnce(reply(503, { error: { code: 'usage_unavailable' } }))
    const r = await render(<UsageSheet visible onClose={() => {}} />)
    await waitFor(() => expect(r.getByTestId('usage-error')).toBeTruthy())
    mockFetch.mockResolvedValueOnce(reply(200, summary)); await fireEvent.press(r.getByTestId('usage-retry'))
    await waitFor(() => expect(r.getByTestId('usage-payg')).toBeTruthy())
    expect(r.queryByTestId('usage-error')).toBeNull()
  })
})
