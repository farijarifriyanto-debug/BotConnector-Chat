// Native login against BotConnector: PKCE in the system browser, one-time code exchange, session kept in the Keychain/Keystore.
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { fetch } from 'expo/fetch'
import { ACCOUNT_BASE, NATIVE_CALLBACK, NATIVE_CLIENT_ID } from '../api/config'
import { challengeFor, parseCallback, randomToken } from './pkce'

export interface Session { sessionToken: string; accessToken: string; userId: string; expiresAt: number }
export interface Account {
  user_id: string; email?: string | null; display_name?: string | null; plan: string; available_micros: number; has_payg: boolean
  plan_models: string[]; cloud: { limit_tokens_24h: number; used_tokens_24h: number; remaining_tokens_24h: number }
}
export type AuthFailure = 'cancelled' | 'invalid' | 'network' | 'unavailable'
export class AuthError extends Error { reason: AuthFailure; constructor(reason: AuthFailure) { super(reason); Object.setPrototypeOf(this, new.target.prototype); this.name = 'AuthError'; this.reason = reason } }

const KEY = 'bc.session.v1'
export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY); if (!raw) return null
    const s = JSON.parse(raw)
    return typeof s?.sessionToken === 'string' && typeof s?.accessToken === 'string' && typeof s?.userId === 'string' && typeof s?.expiresAt === 'number' ? s as Session : null
  } catch { return null }
}
export const saveSession = (s: Session) => SecureStore.setItemAsync(KEY, JSON.stringify(s), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
export const clearSession = () => SecureStore.deleteItemAsync(KEY).catch(() => {})

/** Opens the BotConnector login in the system browser and returns the signed-in session. */
export async function login(): Promise<Session> {
  const state = randomToken(), verifier = randomToken()
  const url = new URL(`${ACCOUNT_BASE}/app-login/start`)
  url.searchParams.set('client_id', NATIVE_CLIENT_ID); url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await challengeFor(verifier)); url.searchParams.set('code_challenge_method', 'S256')
  const result = await WebBrowser.openAuthSessionAsync(url.toString(), NATIVE_CALLBACK)
  if (result.type !== 'success') throw new AuthError('cancelled')
  const cb = parseCallback(result.url)
  if (!cb || cb.state !== state) throw new AuthError('invalid')   // a callback that does not belong to this attempt is refused
  let r: Response
  try {
    r = await fetch(`${ACCOUNT_BASE}/app-login/native/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: cb.code, state: cb.state, client_id: NATIVE_CLIENT_ID, code_verifier: verifier }) })
  } catch { throw new AuthError('network') }
  if (r.status >= 500) throw new AuthError('unavailable')
  if (!r.ok) throw new AuthError('invalid')
  const j = await r.json().catch(() => null)
  if (!j || typeof j.session_token !== 'string' || typeof j.access_token !== 'string' || typeof j.user_id !== 'string') throw new AuthError('invalid')
  const session: Session = { sessionToken: j.session_token, accessToken: j.access_token, userId: j.user_id, expiresAt: Number(j.expires_at) || 0 }
  await saveSession(session)
  return session
}

const bearer = (s: Session) => ({ authorization: `Bearer ${s.sessionToken}` })

/** The signed-in account (plan, balance, quota). null = the server says this session is no longer valid. */
export async function fetchAccount(s: Session): Promise<Account | null> {
  let r: Response
  try { r = await fetch(`${ACCOUNT_BASE}/app-login/native/session`, { headers: { ...bearer(s), accept: 'application/json' } }) } catch { throw new AuthError('network') }
  if (r.status === 401) return null
  if (!r.ok) throw new AuthError('unavailable')
  return (await r.json().catch(() => null)) as Account | null
}

export async function logout(s: Session): Promise<void> {
  try { await fetch(`${ACCOUNT_BASE}/app-login/native/logout`, { method: 'POST', headers: bearer(s) }) } catch { /* the local sign-out must still happen */ }
  await clearSession()
}

export type DeleteFailure = 'wrong_password' | 'confirmation' | 'rate_limited' | 'session' | 'unavailable' | 'network'
/** Permanently deletes the account (App Store 5.1.1(v)). A wrong password never signs the user out. */
export async function deleteAccount(s: Session, currentPassword: string, confirmation: string): Promise<{ ok: true } | { ok: false; reason: DeleteFailure }> {
  let r: Response
  try { r = await fetch(`${ACCOUNT_BASE}/app-login/native/delete-account`, { method: 'POST', headers: { ...bearer(s), 'content-type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword, confirmation }) }) }
  catch { return { ok: false, reason: 'network' } }
  if (r.ok) { await clearSession(); return { ok: true } }
  switch (r.status) {
    case 403: return { ok: false, reason: 'wrong_password' }
    case 422: return { ok: false, reason: 'confirmation' }
    case 429: return { ok: false, reason: 'rate_limited' }
    case 401: await clearSession(); return { ok: false, reason: 'session' }
    default: return { ok: false, reason: 'unavailable' }
  }
}
