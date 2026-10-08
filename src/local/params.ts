import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'

export interface LocalParams { nCtx: number; nPredict: number; temperature: number; topP: number; gpu: boolean; thinking: boolean }
export const DEFAULT_PARAMS: LocalParams = { nCtx: 4096, nPredict: 1024, temperature: 0.7, topP: 0.9, gpu: true, thinking: false }
const KEY = 'bc.local.params.v1'
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)

/** Keeps only sane values from whatever was stored. */
export function sanitize(raw: unknown): LocalParams {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    nCtx: clamp(j.nCtx, 512, 32768, DEFAULT_PARAMS.nCtx), nPredict: clamp(j.nPredict, 16, 8192, DEFAULT_PARAMS.nPredict),
    temperature: clamp(j.temperature, 0, 2, DEFAULT_PARAMS.temperature), topP: clamp(j.topP, 0.05, 1, DEFAULT_PARAMS.topP),
    gpu: typeof j.gpu === 'boolean' ? j.gpu : DEFAULT_PARAMS.gpu, thinking: typeof j.thinking === 'boolean' ? j.thinking : DEFAULT_PARAMS.thinking,
  }
}
const read = (): LocalParams => { try { return sanitize(JSON.parse(Storage.getItemSync(KEY) ?? '{}')) } catch { return DEFAULT_PARAMS } }

interface State { params: LocalParams; set(p: Partial<LocalParams>): void }
export const useLocalParams = create<State>((set, get) => ({
  params: read(),
  set(p) { const params = sanitize({ ...get().params, ...p }); try { Storage.setItemSync(KEY, JSON.stringify(params)) } catch { /* not persisted */ } set({ params }) },
}))
