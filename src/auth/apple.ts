// Sign in with Apple (App Review 4.8): native AuthenticationServices sheet, identity verified by the BotConnector server.
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { fetch } from 'expo/fetch'
import { Platform } from 'react-native'
import { ACCOUNT_BASE, NATIVE_CLIENT_ID } from '../api/config'
import { randomToken } from './pkce'
import { AuthError, saveSession, type Session } from './session'

export type AppleFailure = 'exists' | 'no_email' | 'taken' | 'mismatch' | 'invalid' | 'network' | 'unavailable' | 'rate_limited'
export class AppleError extends Error { reason: AppleFailure; constructor(reason: AppleFailure) { super(reason); Object.setPrototypeOf(this, new.target.prototype); this.name = 'AppleError'; this.reason = reason } }

export interface ApplePending { pendingToken: string; email: string; isPrivateEmail: boolean; displayName: string }
export type AppleStart = { session: Session } | { pending: ApplePending }

/** The system decides: iOS 13+ with an Apple Account. Android and web never show the button. */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  try { return await AppleAuthentication.isAvailableAsync() } catch { return false }
}

/** One Apple sheet. Apple receives SHA-256(nonce); the server gets the raw nonce and checks the token carries its hash. */
async function credential(scopes: AppleAuthentication.AppleAuthenticationScope[]) {
  const nonce = randomToken()
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce)
  let c: AppleAuthentication.AppleAuthenticationCredential
  try { c = await AppleAuthentication.signInAsync({ requestedScopes: scopes, nonce: hashed }) }
  catch (e) { throw (e as { code?: string })?.code === 'ERR_REQUEST_CANCELED' ? new AuthError('cancelled') : new AppleError('invalid') }
  if (!c.identityToken) throw new AppleError('invalid')
  const name = c.fullName ? (AppleAuthentication.formatFullName(c.fullName) || '').trim() : ''
  return { identity_token: c.identityToken, authorization_code: c.authorizationCode ?? '', nonce, name }
}

const json = { 'content-type': 'application/json', accept: 'application/json' }
const bearer = (s: Session) => ({ authorization: `Bearer ${s.sessionToken}` })

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  try { return await fetch(`${ACCOUNT_BASE}${path}`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) }) }
  catch { throw new AppleError('network') }
}

function failure(status: number, fallback: AppleFailure = 'invalid'): AppleError {
  if (status >= 500) return new AppleError('unavailable')
  if (status === 429) return new AppleError('rate_limited')
  return new AppleError(fallback)
}

async function toSession(r: Response): Promise<Session> { return sessionFrom(await r.json().catch(() => null)) }
async function sessionFrom(j: any): Promise<Session> {
  if (!j || typeof j.session_token !== 'string' || typeof j.access_token !== 'string' || typeof j.user_id !== 'string') throw new AppleError('invalid')
  const session: Session = { sessionToken: j.session_token, accessToken: j.access_token, userId: j.user_id, expiresAt: Number(j.expires_at) || 0 }
  await saveSession(session)
  return session
}

/** Sign in, or (first time) get a pending sign-up that needs the currency and the three consents. */
export async function appleSignIn(): Promise<AppleStart> {
  const c = await credential([AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL])
  if (!c.authorization_code) throw new AppleError('invalid')
  const r = await post('/app-login/native/apple/start', {
    client_id: NATIVE_CLIENT_ID, identity_token: c.identity_token, authorization_code: c.authorization_code, nonce: c.nonce,
    ...(c.name ? { display_name: c.name.slice(0, 120) } : {}),
  })
  if (r.status === 409) throw new AppleError('exists')
  if (r.status === 403) throw new AppleError('no_email')
  if (!r.ok) throw failure(r.status)
  const j = await r.json().catch(() => null)
  if (j?.registration_required === true) {
    if (typeof j.pending_token !== 'string' || typeof j.email !== 'string') throw new AppleError('invalid')
    return { pending: { pendingToken: j.pending_token, email: j.email, isPrivateEmail: j.is_private_email === true, displayName: typeof j.display_name === 'string' && j.display_name ? j.display_name : c.name } }
  }
  return { session: await sessionFrom(j) }
}

export async function appleRegister(p: ApplePending, currency: 'IDR' | 'USD', displayName: string): Promise<Session> {
  const name = displayName.trim().slice(0, 120)
  const r = await post('/app-login/native/apple/register', {
    client_id: NATIVE_CLIENT_ID, pending_token: p.pendingToken, billing_currency: currency,
    privacy_consent: true, terms_consent: true, job_data_consent: true, ...(name ? { display_name: name } : {}),
  })
  if (r.status === 409) throw new AppleError('exists')
  if (!r.ok) throw failure(r.status)
  return toSession(r)
}

/** Whether this account uses Sign in with Apple (Settings label, and how account deletion is confirmed). */
export async function appleLinked(s: Session): Promise<boolean | null> {
  try {
    const r = await fetch(`${ACCOUNT_BASE}/app-login/native/apple/status`, { headers: { ...bearer(s), accept: 'application/json' } })
    if (!r.ok) return null
    return (await r.json().catch(() => null))?.linked === true
  } catch { return null }
}

/** Connects Sign in with Apple to the signed-in account (Apple HIG: offer linking an existing account). */
export async function appleLink(s: Session): Promise<void> {
  const c = await credential([])
  if (!c.authorization_code) throw new AppleError('invalid')
  const r = await post('/app-login/native/apple/link', { identity_token: c.identity_token, authorization_code: c.authorization_code, nonce: c.nonce }, bearer(s))
  if (r.status === 409) throw new AppleError('taken')
  if (!r.ok) throw failure(r.status)
}

/** Account deletion for an Apple account: a fresh Sign in with Apple replaces the password (Apple HIG: never ask for one). */
export async function appleDeleteAccount(s: Session, confirmation: string): Promise<void> {
  const c = await credential([])
  const r = await post('/app-login/native/apple/delete-account', { identity_token: c.identity_token, nonce: c.nonce, confirmation }, bearer(s))
  if (r.status === 403) throw new AppleError('mismatch')
  if (r.status === 401) throw new AuthError('invalid')
  if (!r.ok) throw failure(r.status)
}
