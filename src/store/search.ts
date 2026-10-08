import * as SecureStore from 'expo-secure-store'
import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { configureByokSearch } from '../api/api'
import { BYOK_PROVIDERS, byokSearch, type Hit, type SearchProviderId } from '../api/search'

const K = { provider: 'bc.search.provider', count: 'bc.search.count' }, keyName = (id: string) => `bc.search.key.${id}`
const read = (k: string) => { try { return Storage.getItemSync(k) } catch { return null } }
const write = (k: string, v: string) => { try { Storage.setItemSync(k, v) } catch { /* not persisted */ } }
const keys = new Map<string, string>()   // keys are read once from the secure store; never kept in zustand state (it is easy to log by accident)
export const RESULT_COUNTS = [3, 5, 8]

interface State {
  provider: SearchProviderId; count: number; hasKey: Partial<Record<SearchProviderId, boolean>>
  load(): Promise<void>; setProvider(p: SearchProviderId): void; setCount(n: number): void
  setKey(id: Exclude<SearchProviderId, 'botconnector'>, key: string): Promise<void>
  test(): Promise<{ ok: true; n: number } | { ok: false; kind: string }>
}
export const useSearch = create<State>((set, get) => ({
  provider: ((p) => (p === 'brave' || p === 'tavily' || p === 'exa' || p === 'parallel' ? p : 'botconnector'))(read(K.provider)),
  count: ((n) => (RESULT_COUNTS.includes(n) ? n : 5))(Number(read(K.count))), hasKey: {},
  async load() {
    const hasKey: State['hasKey'] = {}
    for (const id of BYOK_PROVIDERS) { try { const v = await SecureStore.getItemAsync(keyName(id)); if (v) { keys.set(id, v); hasKey[id] = true } } catch { /* none */ } }
    set({ hasKey })
  },
  setProvider(provider) { write(K.provider, provider); set({ provider }) },
  setCount(count) { write(K.count, String(count)); set({ count }) },
  async setKey(id, key) {
    const v = key.trim()
    try { if (v) await SecureStore.setItemAsync(keyName(id), v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }); else await SecureStore.deleteItemAsync(keyName(id)) } catch { /* in memory only */ }
    if (v) keys.set(id, v); else keys.delete(id)
    set(s => ({ hasKey: { ...s.hasKey, [id]: !!v } }))
  },
  async test() {
    const { provider, count } = get(); if (provider === 'botconnector') return { ok: true, n: 0 }
    try { return { ok: true, n: (await byokSearch(provider, keys.get(provider) ?? '', 'BotConnector', count)).length } } catch (e) { return { ok: false, kind: (e as { kind?: string })?.kind ?? 'network' } }
  },
}))

/** The user's own provider when one is chosen and has a key; null means "use BotConnector Search". */
export async function searchByok(query: string, signal?: AbortSignal): Promise<Hit[] | null> {
  const { provider, count } = useSearch.getState(); const key = provider === 'botconnector' ? '' : keys.get(provider) ?? ''
  if (provider === 'botconnector' || !key) return null
  try { const hits = await byokSearch(provider, key, query, count, signal); return hits.length ? hits : null } catch (e) { if (signal?.aborted) throw e; return null }   // a failing own key falls back to BotConnector Search
}
configureByokSearch(searchByok)
