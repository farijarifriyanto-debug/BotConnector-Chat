import type { ImageModel } from '../api/api'
import type { BrandId } from './brandIcons'
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

// Which family a model belongs to, read from its own name. Order matters: the first rule that matches wins.
const FAMILY: [RegExp, BrandId][] = [
  [/claude|anthropic|sonnet|opus|haiku/, 'claude'], [/gemma/, 'gemma'], [/gemini|google/, 'gemini'], [/gpt|openai|chatgpt|\bo[134]\b/, 'openai'], [/deepseek/, 'deepseek'], [/qwen|qwq/, 'qwen'],
  [/glm|chatglm|z-ai|zai/, 'zai'], [/kimi|moonshot/, 'kimi'], [/llama|meta-/, 'meta'], [/mistral|mixtral|ministral|codestral|devstral/, 'mistral'], [/nemotron|nvidia/, 'nvidia'], [/mimo|xiaomi/, 'mimo'],
  [/minimax/, 'minimax'], [/grok|\bxai\b/, 'grok'], [/command-|cohere/, 'cohere'], [/flux/, 'flux'], [/stable-?diffusion|sdxl|stability/, 'stability'], [/solar|upstage/, 'upstage'], [/\bphi-|\bmai-|microsoft/, 'microsoft'],
]
const SERVICE: [RegExp, BrandId][] = [[/openrouter/, 'openrouter'], [/ollama/, 'ollama'], [/lm ?studio/, 'lmstudio'], [/hugging ?face/, 'huggingface']]
/** The brand mark for a model, or null (the picker then shows the first letter). Your own providers fall back to the service's mark. */
export function modelBrand(m: Pick<ChatModel, 'id' | 'name' | 'provider' | 'access'>): BrandId | null {
  const own = `${m.id} ${m.name}`.toLowerCase()
  for (const [re, b] of FAMILY) if (re.test(own)) return b
  if (m.access === 'custom') { const p = (m.provider ?? '').toLowerCase(); for (const [re, b] of [...SERVICE, ...FAMILY]) if (re.test(p)) return b }
  return null
}

const WORDS: Record<string, string> = { deepseek: 'DeepSeek', gpt: 'GPT', glm: 'GLM', oss: 'OSS', qwen: 'Qwen', llama: 'Llama', gemini: 'Gemini', gemma: 'Gemma', kimi: 'Kimi', mimo: 'MiMo', minimax: 'MiniMax', nemotron: 'Nemotron', nvidia: 'NVIDIA', claude: 'Claude', openai: 'OpenAI', mistral: 'Mistral', ai: 'AI', it: 'IT', vl: 'VL', moe: 'MoE', llm: 'LLM' }
/** A model name that is really an id ("deepseek-v4-pro:0813") becomes something to read ("DeepSeek V4 Pro 0813"). Names that already have spaces are left alone. */
export function niceName(name: string): string {
  if (/\s/.test(name) || !/[-_:/]/.test(name)) return name
  return name.split(/[-_:/]+/).filter(Boolean).map(w => {
    const k = w.toLowerCase()
    if (WORDS[k]) return WORDS[k]
    if (/^\d[\d.]*$/.test(k)) return w                                  // 4, 0813, 5.6
    if (/^(?:[a-z]\d[\d.]*[a-z]?|\d[\d.]*[a-z])$/.test(k)) return w.toUpperCase()   // v4, k2, a22b, 235b
    const m = /^([a-z]+)(\d[\d.]*)$/.exec(k)                              // qwen3, gemma3
    return m ? (WORDS[m[1]] ?? m[1][0].toUpperCase() + m[1].slice(1)) + m[2] : w[0].toUpperCase() + w.slice(1)
  }).join(' ')
}
