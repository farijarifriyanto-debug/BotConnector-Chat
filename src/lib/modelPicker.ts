import type { ImageModel } from '../api/api'
import type { Access, ChatModel } from './types'

export type ModelFilter = 'all' | 'free' | 'cloud' | 'local' | 'image'
const CLOUD: Access[] = ['auto', 'free', 'plan', 'family', 'payg', 'custom']
const LOCAL: Access[] = ['local', 'laptop']

/** Picture models are listed next to chat models in the picker; picking one opens the Image Studio. */
export const imageAsModel = (m: ImageModel): ChatModel => ({ id: m.id, name: m.name, access: m.access, vision: false, tools: false, reasoning: false, available: true, image: true, refs: m.refs })

/** "Claude Sonnet 5.5 · Max+" → "Claude Sonnet 5.5": the header shows the model, the picker shows the details. */
export const shortModelName = (name: string): string => name.replace(/\s*(?:[·•|]|\().*$/, '').replace(/\s+/g, ' ').trim() || name

export function matchesFilter(m: ChatModel, f: ModelFilter): boolean {
  if (f === 'image') return !!m.image
  if (m.image) return f === 'all'
  return f === 'all' || (f === 'free' && m.access === 'free') || (f === 'cloud' && CLOUD.includes(m.access)) || (f === 'local' && LOCAL.includes(m.access))
}
export function filterModels(list: ChatModel[], f: ModelFilter, query: string): ChatModel[] {
  const q = query.trim().toLowerCase()
  return list.filter(m => matchesFilter(m, f) && (!q || `${m.name} ${m.id} ${m.provider ?? ''}`.toLowerCase().includes(q)))
}

export interface AspectOption { size: string; label: string }
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
/** Sizes the picture model really offers ("1536x1024" → "3:2"). The default is square when offered. */
export function aspectOptions(sizes: string[]): AspectOption[] {
  return sizes.map(size => {
    const m = /^(\d{3,4})x(\d{3,4})$/.exec(size); if (!m) return { size, label: size }
    const w = +m[1], h = +m[2], g = gcd(w, h); return { size, label: `${w / g}:${h / g}` }
  })
}
export const defaultSize = (sizes: string[]): string | undefined => sizes.find(s => s === '1024x1024') ?? sizes.find(s => s !== 'auto') ?? sizes[0]
