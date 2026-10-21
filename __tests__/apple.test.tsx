import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { AppleSignupSheet } from '../src/components/AppleSignupSheet'
import { SettingsSheet } from '../src/components/SettingsSheet'
import { LoginScreen } from '../src/screens/LoginScreen'
import { useAuth } from '../src/store/auth'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.setTimeout(30000)
const createHash = require('crypto').createHash as (a: string) => { update(s: string): { digest(e: string): string } }
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const signIn = jest.requireMock('expo-apple-authentication').signInAsync as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const SESSION = { user_id: 'u1', session_token: 's'.repeat(40), access_token: 'bc_live_mobile_x', expires_at: 9e9 }
const sentBody = (i: number) => JSON.parse(mockFetch.mock.calls[i][1].body)
const credential = { identityToken: 'header.payload.sig', authorizationCode: 'code-123456', fullName: { givenName: 'Sari', familyName: 'Dewi' }, email: null, user: 'apple-user' }

const initial = useAuth.getState()   // real actions; a test may swap one for a mock
beforeEach(() => {
  mockFetch.mockReset(); signIn.mockReset()
  useAuth.setState({ ...initial, status: 'signedOut', session: null, account: null, busy: false, error: null, apple: true, applePending: null, appleLinked: null }, true)
})

describe('Sign in with Apple', () => {
  it('Apple gets SHA-256 of the nonce, the server gets the nonce itself; a known account signs straight in', async () => {
    signIn.mockResolvedValue(credential)
    mockFetch.mockResolvedValueOnce(reply(200, { registration_required: false, ...SESSION }))   // start
      .mockResolvedValue(reply(200, { linked: true, plan: 'free', cloud: {} }))                  // session + status
    await useAuth.getState().loginWithApple()
    const body = sentBody(0)
    expect(mockFetch.mock.calls[0][0]).toBe('https://botconnector.id/app-login/native/apple/start')
    expect(signIn.mock.calls[0][0].nonce).toBe(createHash('sha256').update(body.nonce).digest('hex'))
    expect(body).toMatchObject({ client_id: 'botconnector-mobile', identity_token: credential.identityToken, authorization_code: 'code-123456', display_name: 'Sari Dewi' })
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', appleLinked: true, error: null })
  })

  it('first sign-in waits for the currency and all three consents, then creates the account', async () => {
    signIn.mockResolvedValue(credential)
    mockFetch.mockResolvedValueOnce(reply(200, { registration_required: true, pending_token: 'p'.repeat(40), email: 'x@privaterelay.appleid.com', is_private_email: true, display_name: '' }))
    await useAuth.getState().loginWithApple()
    expect(useAuth.getState().status).toBe('signedOut')
    expect(useAuth.getState().applePending).toMatchObject({ email: 'x@privaterelay.appleid.com', isPrivateEmail: true, displayName: 'Sari Dewi' })

    const r = await render(<AppleSignupSheet />)
    expect(r.getByTestId('apple-signup-email').props.children).toBe('x@privaterelay.appleid.com')
    expect(r.getByTestId('apple-signup-create').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(r.getByTestId('apple-currency-USD'))
    await fireEvent.press(r.getByTestId('apple-consent-privacy')); await fireEvent.press(r.getByTestId('apple-consent-terms'))
    expect(r.getByTestId('apple-signup-create').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(r.getByTestId('apple-consent-data'))
    mockFetch.mockReset().mockResolvedValueOnce(reply(200, { registration_required: false, ...SESSION })).mockResolvedValue(reply(200, { linked: true }))
    await fireEvent.press(r.getByTestId('apple-signup-create'))
    await waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    expect(mockFetch.mock.calls[0][0]).toBe('https://botconnector.id/app-login/native/apple/register')
    expect(sentBody(0)).toEqual({ client_id: 'botconnector-mobile', pending_token: 'p'.repeat(40), billing_currency: 'USD', privacy_consent: true, terms_consent: true, job_data_consent: true, display_name: 'Sari Dewi' })
    expect(useAuth.getState().applePending).toBeNull()
  })

  it('an email that already has an account is not linked silently: the person is told what to do', async () => {
    signIn.mockResolvedValue(credential); mockFetch.mockResolvedValueOnce(reply(409, { detail: 'x' }))
    await useAuth.getState().loginWithApple()
    expect(useAuth.getState().error).toBe('apple_exists')
    const r = await render(<LoginScreen />)
    expect(r.getByTestId('login-error').props.children).toContain('connect Apple in Settings')
  })

  it('closing the Apple sheet is not an error and calls no server', async () => {
    signIn.mockRejectedValue(Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' }))
    await useAuth.getState().loginWithApple()
    expect(useAuth.getState().error).toBeNull(); expect(mockFetch).not.toHaveBeenCalled()
  })

  it('the login screen shows the system Apple button only where Apple offers it', async () => {
    const loginWithApple = jest.fn(); useAuth.setState({ loginWithApple } as never)
    const r = await render(<LoginScreen />)
    await fireEvent.press(r.getByTestId('apple-signin')); expect(loginWithApple).toHaveBeenCalled()
    useAuth.setState({ apple: false } as never)
    const r2 = await render(<LoginScreen />)
    expect(r2.queryByTestId('apple-signin')).toBeNull(); expect(r2.getByTestId('login-button')).toBeTruthy()
  })
})

describe('deleting an Apple account', () => {
  const signedIn = { status: 'signedIn', session: { sessionToken: 's'.repeat(40), accessToken: 'a', userId: 'u1', expiresAt: 9e9 }, account: { email: 'x@privaterelay.appleid.com', plan: 'free' } }

  it('asks for the phrase and Apple, never for a password', async () => {
    const del = jest.fn(async () => ({ ok: false as const, reason: 'apple_mismatch' as const }))
    useAuth.setState({ ...signedIn, appleLinked: true, deleteAccountWithApple: del } as never)
    const r = await render(<SettingsSheet visible onClose={() => {}} />)
    expect(r.getByTestId('apple-using')).toBeTruthy()
    await fireEvent.press(r.getByTestId('delete-account'))
    expect(r.queryByTestId('delete-password')).toBeNull(); expect(r.getByTestId('delete-apple-note')).toBeTruthy()
    expect(r.getByTestId('delete-confirm').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(r.getByTestId('delete-phrase'), 'HAPUS AKUN')
    await fireEvent.press(r.getByTestId('delete-confirm'))
    expect(del).toHaveBeenCalledWith('HAPUS AKUN')
    expect((await r.findByTestId('delete-error')).props.children).toBe('That Apple ID does not belong to this account.')
  })

  it('sends a fresh Apple token with the phrase and signs out once the account is gone', async () => {
    useAuth.setState({ ...signedIn, appleLinked: true } as never)
    signIn.mockResolvedValue({ ...credential, authorizationCode: null })
    const url = 'https://botconnector.id/app-login/native/apple/delete-account'
    mockFetch.mockImplementation(async (u: string) => reply(200, u === url ? { message: 'ok' } : {}))   // other screens may still be loading
    expect(await useAuth.getState().deleteAccountWithApple('HAPUS AKUN')).toEqual({ ok: true })
    const call = mockFetch.mock.calls.find(c => c[0] === url)!
    expect(call[1].headers.authorization).toBe(`Bearer ${'s'.repeat(40)}`)
    expect(Object.keys(JSON.parse(call[1].body)).sort()).toEqual(['confirmation', 'identity_token', 'nonce'])
    expect(useAuth.getState().status).toBe('signedOut')
  })

  it('a password account keeps the password confirmation', async () => {
    useAuth.setState({ ...signedIn, appleLinked: false } as never)
    const r = await render(<SettingsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('delete-account'))
    expect(r.getByTestId('delete-password')).toBeTruthy()
  })
})

describe('deleting a Google/GitHub account (no password they know)', () => {
  const browser = jest.requireMock('expo-web-browser').openAuthSessionAsync as jest.Mock
  const store = jest.requireMock('expo-secure-store').setItemAsync as jest.Mock
  const signedIn = { status: 'signedIn', session: { sessionToken: 'old'.repeat(14), accessToken: 'a', userId: 'u1', expiresAt: 9e9 }, account: { email: 'a@gmail.com', plan: 'free' }, appleLinked: false }
  const signInAgainAs = (userId: string) => {
    browser.mockImplementation(async (url: string) => ({ type: 'success', url: `botconnector://auth/callback?code=c1&state=${new URL(url).searchParams.get('state')}` }))
    mockFetch.mockImplementation(async (u: string) =>
      u.endsWith('/native/exchange') ? reply(200, { ...SESSION, user_id: userId, session_token: 'fresh'.repeat(9) })
      : u.endsWith('/delete-account/reauth') ? reply(200, { message: 'ok' }) : reply(204, {}))
  }
  const calls = (end: string) => mockFetch.mock.calls.filter(c => String(c[0]).endsWith(end))
  beforeEach(() => { browser.mockReset(); store.mockClear(); useAuth.setState(signedIn as never) })

  it('a fresh, cookie-free sign-in to the same account deletes it; the fresh session is never stored', async () => {
    signInAgainAs('u1')
    expect(await useAuth.getState().deleteAccountByLogin('HAPUS AKUN')).toEqual({ ok: true })
    expect(browser.mock.calls[0][2]).toEqual({ preferEphemeralSession: true })
    const del = calls('/delete-account/reauth')[0]
    expect(del[1].headers.authorization).toBe(`Bearer ${'fresh'.repeat(9)}`)
    expect(JSON.parse(del[1].body)).toEqual({ confirmation: 'HAPUS AKUN' })
    expect(store).not.toHaveBeenCalled()
    expect(useAuth.getState().status).toBe('signedOut')
  })

  it('signing in to another account deletes nothing and ends that extra session', async () => {
    signInAgainAs('someone-else')
    expect(await useAuth.getState().deleteAccountByLogin('HAPUS AKUN')).toEqual({ ok: false, reason: 'reauth_other' })
    expect(calls('/delete-account/reauth')).toHaveLength(0)
    expect(calls('/native/logout')[0][1].headers.authorization).toBe(`Bearer ${'fresh'.repeat(9)}`)
    expect(useAuth.getState().status).toBe('signedIn')
  })

  it('closing the login sheet is not an error', async () => {
    browser.mockResolvedValue({ type: 'cancel' })
    expect(await useAuth.getState().deleteAccountByLogin('HAPUS AKUN')).toEqual({ ok: false, reason: 'cancelled' })
    expect(mockFetch.mock.calls.filter(c => String(c[0]).startsWith('https://botconnector.id/app-login/'))).toHaveLength(0)   // other screens may still load models
    expect(useAuth.getState().status).toBe('signedIn')
  })

  it('the sign-in-again button waits for the exact phrase', async () => {
    const byLogin = jest.fn(async () => ({ ok: false as const, reason: 'reauth_other' as const })); useAuth.setState({ deleteAccountByLogin: byLogin } as never)
    const r = await render(<SettingsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('delete-account'))
    expect(r.getByTestId('delete-reauth').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(r.getByTestId('delete-phrase'), 'HAPUS AKUN')
    await fireEvent.press(r.getByTestId('delete-reauth'))
    expect(byLogin).toHaveBeenCalledWith('HAPUS AKUN')
    expect((await r.findByTestId('delete-error')).props.children).toContain('different account')
  })
})
