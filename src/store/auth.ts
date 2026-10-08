import { create } from 'zustand'
import { configureApi } from '../api/api'
import { AuthError, clearSession, deleteAccount as apiDelete, fetchAccount, loadSession, login as apiLogin, logout as apiLogout, type Account, type DeleteFailure, type Session } from '../auth/session'
import { clearConvs } from '../db/convs'

type Status = 'loading' | 'signedOut' | 'signedIn'
interface AuthState {
  status: Status; session: Session | null; account: Account | null; busy: boolean; error: string | null
  init(): Promise<void>; login(): Promise<void>; logout(): Promise<void>; refreshAccount(): Promise<void>
  deleteAccount(password: string, phrase: string): Promise<{ ok: true } | { ok: false; reason: DeleteFailure }>
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading', session: null, account: null, busy: false, error: null,
  async init() {
    const session = await loadSession()
    if (!session) { set({ status: 'signedOut' }); return }
    set({ session, status: 'signedIn' })   // show the app at once; the account is verified in the background
    try {
      const account = await fetchAccount(session)
      if (!account) { await clearSession(); set({ status: 'signedOut', session: null, account: null }); return }
      set({ account })
    } catch { /* offline: keep the session, retry on the next foreground */ }
  },
  async login() {
    if (get().busy) return
    set({ busy: true, error: null })
    try {
      const session = await apiLogin()
      set({ session, status: 'signedIn' })
      await get().refreshAccount()
    } catch (e) { set({ error: e instanceof AuthError && e.reason === 'cancelled' ? null : e instanceof AuthError ? e.reason : 'invalid' }) }
    finally { set({ busy: false }) }
  },
  async refreshAccount() {
    const s = get().session; if (!s) return
    try { const account = await fetchAccount(s); if (!account) { await clearSession(); set({ status: 'signedOut', session: null, account: null }) } else set({ account }) } catch { /* keep what we have */ }
  },
  async logout() {
    const s = get().session
    if (s) await apiLogout(s)
    await clearConvs().catch(() => {})   // chats on this device belong to the signed-in account
    set({ status: 'signedOut', session: null, account: null })
  },
  async deleteAccount(password, phrase) {
    const s = get().session; if (!s) return { ok: false, reason: 'session' }
    const r = await apiDelete(s, password, phrase)
    if (r.ok || r.reason === 'session') { await clearConvs().catch(() => {}); set({ status: 'signedOut', session: null, account: null }) }
    return r
  },
}))

configureApi({ token: () => useAuth.getState().session?.accessToken ?? null, onUnauthorized: () => { void useAuth.getState().refreshAccount() } })
