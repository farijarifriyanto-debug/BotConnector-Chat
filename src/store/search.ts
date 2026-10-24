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
const readMode = (v: string | null): WebFetchMode => (v === 'local' || v === 'off' ? v : 'follow')

interface State {
  provider: SearchProviderId; count: number; hasKey: Partial<Record<SearchProviderId, boolean>>
  /** How fetch_url reads a page: follow the search provider when it can, the app's own reader, or not at all. */
  webFetch: WebFetchMode
  load(): Promise<void>; setProvider(p: SearchProviderId): void; setCount(n: number): void; setWebFetch(mode: WebFetchMode): void
  setKey(id: Exclude<SearchProviderId, 'botconnector'>, key: string): Promise<void>
  test(): Promise<{ ok: true; n: number } | { ok: false; kind: string }>
}
export const useSearch = create<State>((set, get) => ({
  provider: ((p) => (p === 'brave' || p === 'tavily' || p === 'exa' || p === 'parallel' ? p : 'botconnector'))(read(K.provider)),
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

/** Reads a page through the chosen provider when it can read pages; null means "use the app's own reader". */
export async function readByok(url: string, signal?: AbortSignal): Promise<{ title: string; text: string } | null> {
  const { provider } = useSearch.getState()
  if (provider === 'botconnector' || !BYOK_READERS.includes(provider)) return null
  const key = keys.get(provider) ?? ''
  if (!key) return null
  try { return await byokFetch(provider, key, url, signal) } catch (e) { if (signal?.aborted) throw e; return null }
}

configureByokSearch(searchByok)
