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
