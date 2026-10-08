import Storage from 'expo-sqlite/kv-store'
import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'
import { configureEndpoints, customId, listRemoteModels, normalizeBaseUrl, type UrlProblem } from '../api/custom'
import { newId } from '../lib/conv'
import { ChatError, type ChatModel } from '../lib/types'

export interface Provider { id: string; name: string; baseUrl: string; models: { id: string; name?: string }[]; updatedAt: number }
const KEY = 'bc.providers.v1', keyName = (id: string) => `bc.pk.${id}`
const SECURE = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

function readAll(): Provider[] {
  try {
    const j = JSON.parse(Storage.getItemSync(KEY) ?? '[]')
    return Array.isArray(j) ? j.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.baseUrl === 'string' && Array.isArray(p.models)) : []
  } catch { return [] }
}
const writeAll = (list: Provider[]) => { try { Storage.setItemSync(KEY, JSON.stringify(list)) } catch { /* not persisted */ } }
const getKey = async (id: string) => { try { return (await SecureStore.getItemAsync(keyName(id))) ?? '' } catch { return '' } }

export type AddFailure = UrlProblem | 'name' | 'models' | ChatError['kind']
interface State {
  providers: Provider[]
  add(input: { name: string; baseUrl: string; apiKey: string; manualModels: string }): Promise<{ ok: true } | { ok: false; reason: AddFailure }>
  refresh(id: string): Promise<boolean>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export const useProviders = create<State>((set, get) => ({
  providers: readAll(),
  async add({ name, baseUrl, apiKey, manualModels }) {
    const n = name.trim(); if (!n) return { ok: false, reason: 'name' }
    const u = normalizeBaseUrl(baseUrl); if (!u.ok) return { ok: false, reason: u.problem }
    const key = apiKey.trim()
    let models: Provider['models'] = []
    let failure: ChatError['kind'] | null = null
    try { models = await listRemoteModels(u.url, key) } catch (e) { failure = e instanceof ChatError ? e.kind : 'network' }
    if (failure === 'badkey') return { ok: false, reason: 'badkey' }   // a wrong key is worth telling about even if the user typed model ids
    const typed = manualModels.split(/[,\n]/).map(x => x.trim()).filter(Boolean)
    if (typed.length) models = [...new Map([...typed.map(id => ({ id })), ...models].map(m => [m.id, m])).values()]
    if (!models.length) return { ok: false, reason: failure ?? 'models' }
    const p: Provider = { id: newId().replace(/[^a-z0-9]/gi, '').slice(0, 12), name: n.slice(0, 40), baseUrl: u.url, models, updatedAt: Date.now() }
    try { if (key) await SecureStore.setItemAsync(keyName(p.id), key, SECURE) } catch { return { ok: false, reason: 'rejected' } }
    const providers = [...get().providers, p]; writeAll(providers); set({ providers })
    return { ok: true }
  },
  async refresh(id) {
    const p = get().providers.find(x => x.id === id); if (!p) return false
    try {
      const models = await listRemoteModels(p.baseUrl, await getKey(id)); if (!models.length) return false
      const providers = get().providers.map(x => (x.id === id ? { ...x, models, updatedAt: Date.now() } : x)); writeAll(providers); set({ providers }); return true
    } catch { return false }
  },
  async remove(id) {
    await SecureStore.deleteItemAsync(keyName(id)).catch(() => {})
    const providers = get().providers.filter(x => x.id !== id); writeAll(providers); set({ providers })
  },
  async clear() { for (const p of get().providers) await SecureStore.deleteItemAsync(keyName(p.id)).catch(() => {}); writeAll([]); set({ providers: [] }) },
}))

configureEndpoints(async id => { const p = useProviders.getState().providers.find(x => x.id === id); return p ? { baseUrl: p.baseUrl, apiKey: await getKey(id) } : null })

/** Provider models as picker entries. Capabilities are unknown, so Web search uses search-first (works with every model). */
export const customModels = (): ChatModel[] => useProviders.getState().providers.flatMap(p => p.models.map((m): ChatModel => ({
  id: customId(p.id, m.id), name: m.name || m.id, access: 'custom', provider: p.name, vision: false, tools: false, reasoning: false, available: true,
})))
