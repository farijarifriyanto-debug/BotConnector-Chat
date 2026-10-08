import { aspectOptions, defaultSize, filterModels, imageAsModel, matchesFilter, shortModelName } from '../src/lib/modelPicker'
import type { ChatModel } from '../src/lib/types'

const m = (id: string, access: ChatModel['access'], extra: Partial<ChatModel> = {}): ChatModel => ({ id, name: id, access, vision: false, tools: false, reasoning: false, available: true, ...extra })

describe('model picker helpers', () => {
  it('shortens only decoration, never the model identity', () => {
    expect(shortModelName('Claude Sonnet 5.5 · Max+')).toBe('Claude Sonnet 5.5')
    expect(shortModelName('Gemini 2.5 Flash Lite (Free)')).toBe('Gemini 2.5 Flash Lite')
    expect(shortModelName('GPT-OSS 20B')).toBe('GPT-OSS 20B')
    expect(shortModelName('· odd')).toBe('· odd')   // never returns an empty header
  })
  it('filters by access group and by search text', () => {
    const list = [m('a', 'free'), m('b', 'plan'), m('c', 'payg'), m('d', 'local'), m('e', 'laptop', { provider: 'Dapur' }), m('f', 'custom', { provider: 'OpenRouter' }), imageAsModel({ id: 'img', name: 'Flux', access: 'free', sizes: [], refs: true })]
    const ids = (f: Parameters<typeof filterModels>[1], q = '') => filterModels(list, f, q).map(x => x.id)
    expect(ids('all')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'img'])
    expect(ids('free')).toEqual(['a'])                       // a free picture model is under Image, not under Free chat
    expect(ids('cloud')).toEqual(['a', 'b', 'c', 'f'])
    expect(ids('local')).toEqual(['d', 'e'])
    expect(ids('image')).toEqual(['img'])
    expect(ids('all', 'dapur')).toEqual(['e'])               // provider name is searchable
    expect(ids('all', 'nothing')).toEqual([])
    expect(matchesFilter(list[6], 'cloud')).toBe(false)
  })
  it('offers only the sizes the model lists, square first', () => {
    expect(aspectOptions(['auto', '1024x1024', '1536x1024', '1024x1536']).map(o => o.label)).toEqual(['auto', '1:1', '3:2', '2:3'])
    expect(defaultSize(['auto', '1536x1024', '1024x1024'])).toBe('1024x1024')
    expect(defaultSize(['auto', '1536x1024'])).toBe('1536x1024')
    expect(defaultSize([])).toBeUndefined()
  })
})

import { modelBrand } from '../src/lib/modelPicker'
describe('model brand marks', () => {
  const b = (name: string, access: ChatModel['access'] = 'free', extra: Partial<ChatModel> = {}) => modelBrand({ id: name, name, access, ...extra })
  it('reads the family from the model name, cloud or local', () => {
    expect(b('Claude Sonnet 5.5', 'plan')).toBe('claude'); expect(b('Gemini 2.5 Flash Lite')).toBe('gemini'); expect(b('Gemma 3 1B', 'local')).toBe('gemma')
    expect(b('GPT-OSS 20B')).toBe('openai'); expect(b('GPT-6 Luna', 'plan')).toBe('openai'); expect(b('DeepSeek V4.1 Flash')).toBe('deepseek')
    expect(b('Qwen3 0.6B', 'local')).toBe('qwen'); expect(b('GLM-5.3 Flash')).toBe('zai'); expect(b('Kimi K2.6', 'plan')).toBe('kimi')
    expect(b('Llama 3.2 1B Instruct', 'local')).toBe('meta'); expect(b('NVIDIA Nemotron 3 Super')).toBe('nvidia'); expect(b('Laguna S 2.1')).toBeNull()   // its mark needs SVG masks that do not draw reliably: the letter is shown instead
  })
  it('does not guess: unknown families get no mark, and Auto has none to read', () => {
    expect(b('Ling 3.0 Flash')).toBeNull(); expect(b('Agnes 3.0 Flash')).toBeNull(); expect(b('Auto', 'auto')).toBeNull()
    expect(b('Gemini')).toBe('gemini'); expect(b('Pro')).toBeNull()   // no accidental match on short words
  })
  it('your own provider falls back to the service mark, but a laptop name never does', () => {
    expect(b('my-model', 'custom', { provider: 'OpenRouter' })).toBe('openrouter'); expect(b('my-model', 'custom', { provider: 'Ollama (laptop)' })).toBe('ollama')
    expect(b('my-model', 'laptop', { provider: 'Ollama PC' })).toBeNull()
  })
})
