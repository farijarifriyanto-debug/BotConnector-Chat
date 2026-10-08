// On-device inference through llama.rn (llama.cpp). One model is kept loaded; picking another one releases the first.
import type { Delta } from '../api/api'
import { registerStreamer } from '../api/api'
import { ChatError } from '../lib/types'
import { useLocal, pathOf } from './store'
import { useLocalParams, type LocalParams } from './params'

import { LOCAL_PREFIX } from './ids'
type Llama = typeof import('llama.rn')
type Ctx = Awaited<ReturnType<Llama['initLlama']>>
let loaded: { id: string; key: string; ctx: Ctx } | null = null
let chain: Promise<unknown> = Promise.resolve()   // loading/releasing never overlaps
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p }

const initKey = (id: string, p: LocalParams) => `${id}|${p.nCtx}|${p.gpu}`
async function ensureLoaded(id: string, p: LocalParams): Promise<Ctx> {
  return serial(async () => {
    const key = initKey(id, p)
    if (loaded?.key === key) return loaded.ctx
    if (loaded) { await loaded.ctx.release().catch(() => {}); loaded = null }
    const m = useLocal.getState().models.find(x => x.id === id); if (!m) throw new ChatError('rejected')
    const { initLlama } = require('llama.rn') as Llama
    const ctx = await initLlama({ model: pathOf(m), n_ctx: p.nCtx, n_gpu_layers: p.gpu ? 99 : 0, use_mlock: false })
    loaded = { id, key, ctx }
    return ctx
  })
}
export const releaseLocal = (id?: string) => serial(async () => { if (loaded && (!id || loaded.id === id)) { await loaded.ctx.release().catch(() => {}); loaded = null } })
export const loadedLocalId = () => loaded?.id ?? null

const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => (p?.type === 'text' ? String(p.text ?? '') : '')).join('') : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function* streamLocal(body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<Delta> {
  const id = String(body.model), p = useLocalParams.getState().params
  let ctx: Ctx
  try { ctx = await ensureLoaded(id, p) } catch (e) { throw e instanceof ChatError ? e : new ChatError('unavailable') }
  if (signal?.aborted) throw new ChatError('aborted')
  const messages = (Array.isArray(body.messages) ? body.messages : []).map((m: any) => ({ role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user', content: textOf(m.content) })).filter(m => m.content)
  const queue: Delta[] = []; let wake: (() => void) | null = null, done = false, failure: unknown = null
  const push = (d: Delta) => { queue.push(d); wake?.(); wake = null }
  const onAbort = () => { void ctx.stopCompletion().catch(() => {}) }
  signal?.addEventListener('abort', onAbort)
  const run = ctx.completion({
    messages, jinja: true, n_predict: Math.min(num(body.max_tokens) ?? p.nPredict, p.nPredict), temperature: num(body.temperature) ?? p.temperature, top_p: p.topP,
    enable_thinking: p.thinking, stop: ['</s>', '<|end|>', '<|im_end|>', '<|eot_id|>'],
  } as any, d => { if (d.reasoning_content) push({ reasoning: d.reasoning_content }); if (d.content) push({ content: d.content }) })
    .then(() => push({ finish: 'stop' })).catch(e => { failure = e }).finally(() => { done = true; wake?.(); wake = null })
  try {
    for (;;) {
      while (queue.length) yield queue.shift()!
      if (done) break
      await new Promise<void>(r => { wake = r })
    }
    if (failure && !signal?.aborted) throw new ChatError('unavailable')
    if (signal?.aborted) throw new ChatError('aborted')
  } finally { signal?.removeEventListener('abort', onAbort); await run.catch(() => {}) }
}
registerStreamer(LOCAL_PREFIX, streamLocal)
