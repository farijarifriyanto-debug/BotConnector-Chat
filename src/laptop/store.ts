import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { listDevices, listModels, laptopId, type Device, type LaptopModel } from './api'
import type { ChatModel } from '../lib/types'

interface Entry { device: Device; models: LaptopModel[] }
const KEY = 'bc.laptop.cache.v1'
const readCache = (): Entry[] => { try { const j = JSON.parse(Storage.getItemSync(KEY) ?? '[]'); return Array.isArray(j) ? j.filter(e => e?.device?.id && Array.isArray(e.models)) : [] } catch { return [] } }
const writeCache = (e: Entry[]) => { try { Storage.setItemSync(KEY, JSON.stringify(e)) } catch { /* not persisted */ } }

interface State { entries: Entry[]; loading: boolean; error: string | null; refresh(): Promise<void>; clear(): void }
/** Devices and the models each one offers. Offline laptops keep their last known list (shown unavailable). */
export const useLaptop = create<State>((set, get) => ({
  entries: readCache(), loading: false, error: null,
  async refresh() {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const devices = await listDevices()
      const old = new Map(get().entries.map(e => [e.device.id, e.models]))
      const entries = await Promise.all(devices.map(async (device): Promise<Entry> => {
        if (!device.online) return { device, models: old.get(device.id) ?? [] }
        try { return { device, models: await Promise.race([listModels(device.id), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('slow')), 10_000))]) } } catch { return { device, models: old.get(device.id) ?? [] } }
      }))
      writeCache(entries); set({ entries })
    } catch (e) { set({ error: (e as { code?: string })?.code ?? 'network' }) }
    set({ loading: false })
  },
  clear() { writeCache([]); set({ entries: [] }) },
}))

export const laptopModels = (): ChatModel[] => useLaptop.getState().entries.flatMap(e => e.models.map((m): ChatModel => ({
  id: laptopId(e.device.id, m.runtime, m.id), name: m.name, access: 'laptop', provider: e.device.name, vision: false, tools: false, reasoning: false, available: e.device.online,
  reason: e.device.online ? undefined : 'offline',
})))
