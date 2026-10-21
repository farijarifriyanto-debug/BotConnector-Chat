import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { configureApi } from '../api/api'
import { configureFiles } from '../api/files'
import { configureLaptop } from '../laptop/api'
import { configureSync } from '../sync/chatSync'
import { AuthError, clearSession, deleteAccount as apiDelete, deleteAccountByReauth, fetchAccount, loadSession, login as apiLogin, logout as apiLogout, revokeSession, type Account, type DeleteFailure, type Session } from '../auth/session'
import { AppleError, appleAvailable, appleDeleteAccount, appleLink, appleLinked, appleRegister, appleSignIn, type ApplePending } from '../auth/apple'
import { clearConvs } from '../db/convs'

export type AppleDeleteFailure = DeleteFailure | 'apple_mismatch' | 'cancelled'
const appleReason = (e: unknown): string | null =>
  e instanceof AuthError && e.reason === 'cancelled' ? null : e instanceof AppleError ? `apple_${e.reason}` : e instanceof AuthError ? e.reason : 'invalid'

type Status = 'loading' | 'signedOut' | 'signedIn' | 'guest'
const GUEST = 'bc.guest'
const guestFlag = () => { try { return Storage.getItemSync(GUEST) === '1' } catch { return false } }
const setGuestFlag = (on: boolean) => { try { if (on) Storage.setItemSync(GUEST, '1'); else Storage.removeItemSync(GUEST) } catch { /* not persisted */ } }
interface AuthState {
  status: Status; session: Session | null; account: Account | null; busy: boolean; error: string | null
  /** Sign in with Apple is offered (iOS with an Apple Account); applePending = first sign-in waiting for currency + consents. */
  apple: boolean; applePending: ApplePending | null; appleLinked: boolean | null
  init(): Promise<void>; continueAsGuest(): void; login(): Promise<void>; logout(): Promise<void>; refreshAccount(): Promise<void>
  deleteAccount(password: string, phrase: string): Promise<{ ok: true } | { ok: false; reason: DeleteFailure }>
  loginWithApple(): Promise<void>; completeAppleSignup(currency: 'IDR' | 'USD', name: string): Promise<void>; cancelAppleSignup(): void
  /** 'ok', null when the person closed the Apple sheet, or an 'apple_<reason>' failure */
  linkApple(): Promise<string | null>
  deleteAccountWithApple(phrase: string): Promise<{ ok: true } | { ok: false; reason: AppleDeleteFailure }>
  /** Google/GitHub accounts (no password they know): confirm by signing in again, then delete. */
  deleteAccountByLogin(phrase: string): Promise<{ ok: true } | { ok: false; reason: AppleDeleteFailure }>
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading', session: null, account: null, busy: false, error: null, apple: false, applePending: null, appleLinked: null,
  async init() {
    void appleAvailable().then(apple => set({ apple }))
    const session = await loadSession()
    if (!session) { set({ status: guestFlag() ? 'guest' : 'signedOut' }); return }
    set({ session, status: 'signedIn' })   // show the app at once; the account is verified in the background
    try {
      const account = await fetchAccount(session)
      if (!account) { await clearSession(); set({ status: 'signedOut', session: null, account: null }); return }
      set({ account })
    } catch { /* offline: keep the session, retry on the next foreground */ }
  },
  /** Own providers and on-device models need no BotConnector account. */
  continueAsGuest() { setGuestFlag(true); set({ status: 'guest' }) },
  async login() {
    if (get().busy) return
    set({ busy: true, error: null })
    try {
      const session = await apiLogin()
      setGuestFlag(false); set({ session, status: 'signedIn' })
      await get().refreshAccount()
    } catch (e) { set({ error: e instanceof AuthError && e.reason === 'cancelled' ? null : e instanceof AuthError ? e.reason : 'invalid' }) }
    finally { set({ busy: false }) }
  },
  async refreshAccount() {
    const s = get().session; if (!s) return
    try { const account = await fetchAccount(s); if (!account) { await clearSession(); set({ status: 'signedOut', session: null, account: null }) } else set({ account }) } catch { /* keep what we have */ }
    if (get().apple && get().session) { const linked = await appleLinked(s); if (linked !== null) set({ appleLinked: linked }) }
  },
  async loginWithApple() {
    if (get().busy) return
    set({ busy: true, error: null })
    try {
      const r = await appleSignIn()
      if ('pending' in r) { set({ applePending: r.pending }); return }
      setGuestFlag(false); set({ session: r.session, status: 'signedIn', appleLinked: true })
      await get().refreshAccount()
    } catch (e) { set({ error: appleReason(e) }) }
    finally { set({ busy: false }) }
  },
  async completeAppleSignup(currency, name) {
    const p = get().applePending; if (!p || get().busy) return
    set({ busy: true, error: null })
    try {
      const session = await appleRegister(p, currency, name)
      setGuestFlag(false); set({ session, status: 'signedIn', applePending: null, appleLinked: true })
      await get().refreshAccount()
    } catch (e) { set({ error: appleReason(e), applePending: e instanceof AppleError && e.reason === 'network' ? p : null }) }   // the pending ticket is single-use once it reached the server
    finally { set({ busy: false }) }
  },
  cancelAppleSignup() { set({ applePending: null, error: null }) },
  async linkApple() {
    const s = get().session; if (!s) return 'session'
    try { await appleLink(s); set({ appleLinked: true }); return 'ok' } catch (e) { return appleReason(e) }   // null = the person closed the Apple sheet
  },
  async deleteAccountWithApple(phrase) {
    const s = get().session; if (!s) return { ok: false, reason: 'session' }
    try { await appleDeleteAccount(s, phrase) } catch (e) {
      if (e instanceof AuthError && e.reason === 'cancelled') return { ok: false, reason: 'cancelled' }
      if (e instanceof AuthError) { await clearSession(); await clearConvs().catch(() => {}); set({ status: 'signedOut', session: null, account: null }); return { ok: false, reason: 'session' } }
      const reason = e instanceof AppleError ? e.reason : 'unavailable'
      return { ok: false, reason: reason === 'mismatch' ? 'apple_mismatch' : reason === 'rate_limited' ? 'rate_limited' : reason === 'network' ? 'network' : 'unavailable' }
    }
    await clearSession(); await clearConvs().catch(() => {})
    set({ status: 'signedOut', session: null, account: null, appleLinked: null })
    return { ok: true }
  },
  async deleteAccountByLogin(phrase) {
    const s = get().session; if (!s) return { ok: false, reason: 'session' }
    let fresh: Session
    try { fresh = await apiLogin({ reauth: true }) } catch (e) {
      const why = e instanceof AuthError ? e.reason : 'invalid'
      return { ok: false, reason: why === 'cancelled' ? 'cancelled' : why === 'network' ? 'network' : why === 'invalid' ? 'reauth' : 'unavailable' }
    }
    if (fresh.userId !== s.userId) { await revokeSession(fresh); return { ok: false, reason: 'reauth_other' } }   // signed in as someone else: delete nothing
    const r = await deleteAccountByReauth(fresh, phrase)
    if (!r.ok) { await revokeSession(fresh); return r }
    await clearConvs().catch(() => {})
    set({ status: 'signedOut', session: null, account: null, appleLinked: null })
    return r
  },
  async logout() {
    const s = get().session
    if (s) await apiLogout(s)
    await clearConvs().catch(() => {})   // chats on this device belong to the signed-in account
    setGuestFlag(false); set({ status: 'signedOut', session: null, account: null, appleLinked: null })
  },
  async deleteAccount(password, phrase) {
    const s = get().session; if (!s) return { ok: false, reason: 'session' }
    const r = await apiDelete(s, password, phrase)
    if (r.ok || r.reason === 'session') { await clearConvs().catch(() => {}); set({ status: 'signedOut', session: null, account: null }) }
    return r
  },
}))

configureApi({ token: () => useAuth.getState().session?.accessToken ?? null, onUnauthorized: () => { void useAuth.getState().refreshAccount() } })
configureFiles(() => useAuth.getState().session?.accessToken ?? null)
configureLaptop(() => useAuth.getState().session?.accessToken ?? null)
configureSync(() => useAuth.getState().session?.sessionToken ?? null)
