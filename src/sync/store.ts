import { create } from 'zustand'
import { disableSync, enableSync, loadState, markDeleted, runSync, type SyncStatus } from './chatSync'

let reload: () => Promise<void> = async () => {}
/** The chat store tells this module how to refresh its in-memory list after a pull. */
export const registerReload = (fn: () => Promise<void>) => { reload = fn }

interface State { enabled: boolean; status: SyncStatus | null; syncNow(): Promise<void>; enable(): Promise<void>; disable(purge: boolean): Promise<void> }
export const useSync = create<State>((set, get) => ({
  enabled: loadState().enabled, status: null,
  async syncNow() {
    if (!get().enabled) return
    set({ status: { phase: 'syncing', pending: get().status?.pending ?? 0, usage: get().status?.usage, lastAt: get().status?.lastAt } })
    const st = await runSync(); set({ status: st }); await reload()
    if (st.phase === 'privacy') { await disableSync(false); set({ enabled: false }) }   // "local only" privacy mode means nothing may leave the device
  },
  async enable() { await enableSync(); set({ enabled: true }); await get().syncNow() },
  async disable(purge) { await disableSync(purge); set({ enabled: false, status: null }); await reload() },
}))

let timer: ReturnType<typeof setTimeout> | null = null
/** Sync soon (a burst of changes becomes one pass). A no-op while sync is off. */
export function scheduleSync(delay = 2500) {
  if (!useSync.getState().enabled) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void useSync.getState().syncNow() }, delay)
}
export const noteDeleted = (id: string) => { markDeleted(id); scheduleSync() }
