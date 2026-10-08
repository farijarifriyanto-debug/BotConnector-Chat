import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { downloadUrl } from './hf'
import { LOCAL_PREFIX } from './ids'
import type { ChatModel } from '../lib/types'

export interface LocalModel { id: string; name: string; file: string; bytes: number; repo?: string; addedAt: number }
export interface Download { received: number; total: number; error?: 'space' | 'network' | 'gated' | 'failed' }
const KEY = 'bc.local.models.v1', TOKEN = 'bc.hf.token'
const dir = () => `${FileSystem.documentDirectory}models/`          // the app container path changes between updates, so only the file name is stored
export const pathOf = (m: Pick<LocalModel, 'file'>) => dir() + m.file
export const localId = (file: string) => LOCAL_PREFIX + file

const readModels = (): LocalModel[] => {
  try { const j = JSON.parse(Storage.getItemSync(KEY) ?? '[]'); return Array.isArray(j) ? j.filter(m => m && typeof m.id === 'string' && typeof m.file === 'string' && typeof m.name === 'string') : [] } catch { return [] }
}
const writeModels = (l: LocalModel[]) => { try { Storage.setItemSync(KEY, JSON.stringify(l)) } catch { /* not persisted */ } }
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 120)
const displayName = (file: string) => file.replace(/\.gguf$/i, '').replace(/[-_]+/g, ' ')

interface State {
  models: LocalModel[]; downloads: Record<string, Download>; hfToken: string
  loadToken(): Promise<void>; setToken(t: string): Promise<void>
  download(src: { repo: string; file: string; bytes: number; name?: string }): Promise<void>
  cancel(id: string): Promise<void>
  /** a failed download starts again (same file, same place) */
  retry(id: string): Promise<void>
  remove(id: string): Promise<void>
}
const tasks = new Map<string, FileSystem.DownloadResumable>()
const sources = new Map<string, { repo: string; file: string; bytes: number; name?: string }>()

export const useLocal = create<State>((set, get) => ({
  models: readModels(), downloads: {}, hfToken: '',
  async loadToken() { try { set({ hfToken: (await SecureStore.getItemAsync(TOKEN)) ?? '' }) } catch { /* none */ } },
  async setToken(t) {
    const v = t.trim(); set({ hfToken: v })
    try { if (v) await SecureStore.setItemAsync(TOKEN, v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }); else await SecureStore.deleteItemAsync(TOKEN) } catch { /* kept in memory only */ }
  },
  async download({ repo, file, bytes, name }) {
    const fname = safeName(file.split('/').pop() ?? file), id = localId(fname)
    sources.set(id, { repo, file, bytes, name })
    if (get().models.some(m => m.id === id) || get().downloads[id] && !get().downloads[id].error) return
    const setDl = (d: Download | null) => set(s => { const downloads = { ...s.downloads }; if (d) downloads[id] = d; else delete downloads[id]; return { downloads } })
    setDl({ received: 0, total: bytes })
    try {
      await FileSystem.makeDirectoryAsync(dir(), { intermediates: true })
      const free = await FileSystem.getFreeDiskStorageAsync().catch(() => Infinity)
      if (bytes && free < bytes * 1.1 + 200 * 1024 * 1024) { setDl({ received: 0, total: bytes, error: 'space' }); return }
      const part = pathOf({ file: fname }) + '.part'
      await FileSystem.deleteAsync(part, { idempotent: true })
      const headers: Record<string, string> = get().hfToken ? { authorization: `Bearer ${get().hfToken}` } : {}
      const task = FileSystem.createDownloadResumable(downloadUrl(repo, file), part, { headers }, p => setDl({ received: p.totalBytesWritten, total: p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : bytes }))
      tasks.set(id, task)
      const res = await task.downloadAsync()
      tasks.delete(id)
      if (!res) { setDl(null); await FileSystem.deleteAsync(part, { idempotent: true }); return }   // cancelled
      if (res.status === 401 || res.status === 403) { await FileSystem.deleteAsync(part, { idempotent: true }); setDl({ received: 0, total: bytes, error: 'gated' }); return }
      if (res.status < 200 || res.status >= 300) { await FileSystem.deleteAsync(part, { idempotent: true }); setDl({ received: 0, total: bytes, error: 'failed' }); return }
      const info = await FileSystem.getInfoAsync(part)
      const size = info.exists ? info.size : bytes
      if (bytes && size < bytes * 0.98) { await FileSystem.deleteAsync(part, { idempotent: true }); setDl({ received: 0, total: bytes, error: 'network' }); return }   // truncated download is never offered as a model
      await FileSystem.moveAsync({ from: part, to: pathOf({ file: fname }) })
      const m: LocalModel = { id, name: name || displayName(fname), file: fname, bytes: size, repo, addedAt: Date.now() }
      const models = [...get().models.filter(x => x.id !== id), m]; writeModels(models); set({ models }); setDl(null)
    } catch { tasks.delete(id); setDl({ received: 0, total: bytes, error: 'network' }) }
  },
  async retry(id) { const src = sources.get(id); if (src && get().downloads[id]?.error) await get().download(src) },
  async cancel(id) { const t = tasks.get(id); tasks.delete(id); try { await t?.cancelAsync() } catch { /* already finished */ } set(s => { const downloads = { ...s.downloads }; delete downloads[id]; return { downloads } }) },
  async remove(id) {
    const m = get().models.find(x => x.id === id); if (!m) return
    const { releaseLocal } = await import('./engine'); await releaseLocal(id).catch(() => {})
    await FileSystem.deleteAsync(pathOf(m), { idempotent: true }).catch(() => {})
    const models = get().models.filter(x => x.id !== id); writeModels(models); set({ models })
  },
}))

/** Installed models as picker entries. Tools are off, so Web search uses search-first, which works with every model. */
export const localModels = (): ChatModel[] => useLocal.getState().models.map((m): ChatModel => ({
  id: m.id, name: m.name, access: 'local', vision: false, tools: false, reasoning: /qwen3|deepseek|r1|think/i.test(m.name), available: true, provider: 'local',
}))
