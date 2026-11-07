import * as SecureStore from 'expo-secure-store'
import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { configureByokSearch } from '../api/api'
import { BYOK_PROVIDERS, BYOK_READERS, byokFetch, byokSearch, type Hit, type SearchProviderId } from '../api/search'
import type { WebFetchMode } from '../lib/types'

const K = { provider: 'bc.search.provider', count: 'bc.search.count', fetch: 'bc.webFetch' }, keyName = (id: string) => `bc.search.key.${id}`
const read = (k: string) => { try { return Storage.getItemSync(k) } catch { return null } }
const write = (k: string, v: string) => { try { Storage.setItemSync(k, v) } catch { /* not persisted */ } }
const keys = new Map<string, string>()   // keys are read once from the secure store; never kept in zustand state (it is easy to log by accident)
export const RESULT_COUNTS = [3, 5, 8]
const readMode = (v: string | null): WebFetchMode => (v === 'off' ? v : 'follow')

interface State {
  provider: SearchProviderId; count: number; hasKey: Partial<Record<SearchProviderId, boolean>>
  /** How fetch_url reads a page: follow the search provider when it can, or not at all. */
  webFetch: WebFetchMode
  load(): Promise<void>; setProvider(p: SearchProviderId): void; setCount(n: number): void; setWebFetch(mode: WebFetchMode): void
  setKey(id: SearchProviderId, key: string): Promise<void>
  test(): Promise<{ ok: true; n: number } | { ok: false; kind: string }>
}
export const useSearch = create<State>((set, get) => ({
  provider: BYOK_PROVIDERS.includes(read(K.provider) as SearchProviderId) ? read(K.provider) as SearchProviderId : 'brave',   // a stale cloud choice from an old build falls back to the first user provider
  count: ((n) => (RESULT_COUNTS.includes(n) ? n : 5))(Number(read(K.count))), hasKey: {},
  webFetch: readMode(read(K.fetch)),
  async load() {
    const hasKey: State['hasKey'] = {}
    for (const id of BYOK_PROVIDERS) { try { const v = await SecureStore.getItemAsync(keyName(id)); if (v) { keys.set(id, v); hasKey[id] = true } } catch { /* none */ } }
    set({ hasKey })
  },
  setProvider(provider) { write(K.provider, provider); set({ provider }) },
  setCount(count) { write(K.count, String(count)); set({ count }) },
  setWebFetch(webFetch) { write(K.fetch, webFetch); set({ webFetch }) },
  async setKey(id, key) {
    const v = key.trim()
    try { if (v) await SecureStore.setItemAsync(keyName(id), v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }); else await SecureStore.deleteItemAsync(keyName(id)) } catch { /* in memory only */ }
    if (v) keys.set(id, v); else keys.delete(id)
    set(s => ({ hasKey: { ...s.hasKey, [id]: !!v } }))
  },
  async test() {
    const { provider, count } = get()
    try { return { ok: true, n: (await byokSearch(provider, keys.get(provider) ?? '', 'BotConnector', count)).length } } catch (e) { return { ok: false, kind: (e as { kind?: string })?.kind ?? 'network' } }
  },
}))

/** The user's own provider when it is chosen and has a key; null means "no key saved". */
export async function searchByok(query: string, signal?: AbortSignal): Promise<Hit[] | null> {
  const { provider, count } = useSearch.getState(); const key = keys.get(provider) ?? ''
  if (!key) return null
  // A configured provider answers for itself: failures surface as failures and zero results stay zero,
  // so the recipient of the user's words never silently changes.
  return byokSearch(provider, key, query, count, signal)
}

/** Reads a page through the chosen provider when it can read pages; null means "this provider cannot read". */
export async function readByok(url: string, signal?: AbortSignal): Promise<{ title: string; text: string } | null> {
  const { provider } = useSearch.getState()
  if (!BYOK_READERS.includes(provider)) return null
  const key = keys.get(provider) ?? ''
  if (!key) return null
  try { return await byokFetch(provider, key, url, signal) } catch (e) { if (signal?.aborted) throw e; return null }
}

configureByokSearch(searchByok)
