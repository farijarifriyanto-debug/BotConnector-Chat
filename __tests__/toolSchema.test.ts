import './helpers/mocks'
import { TOOLS } from '../src/lib/agent'
import { applyOverrides, cleanOverride, describeParams, isModified, readOverrides, type ToolDef } from '../src/lib/toolSchema'
import { useToolSchema } from '../src/store/toolSchema'

const defs = TOOLS as ToolDef[]
const web = defs[0]

describe('tool schema overrides', () => {
  it('lists the parameters of the shipped tools', () => {
    expect(describeParams(web).map(p => p.path)).toEqual(['query'])
    expect(describeParams(defs[1]).map(p => p.path)).toEqual(['url'])
    expect(describeParams({ type: 'function', function: { name: 'x', description: '' } })).toEqual([])
  })

  it('walks nested properties and item descriptions like the reference app', () => {
    const nested: ToolDef = { type: 'function', function: { name: 'deep', description: '', parameters: {
      type: 'object', properties: {
        questions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', description: 'id' } } } },
        tags: { type: 'array', items: { type: 'string', description: 'tag' } },
      } } } }
    expect(describeParams(nested).map(p => p.path)).toEqual(['questions', 'questions.items.id', 'tags', 'tags.items'])
  })

  it('replaces the top description and a parameter description without touching anything else', () => {
    const [out] = applyOverrides([web], { web_search: { description: 'Cari di internet.', params: { query: 'Kata pencarian' } } })
    expect(out.function.description).toBe('Cari di internet.')
    expect((out.function.parameters as { properties: { query: { description: string } } }).properties.query.description).toBe('Kata pencarian')
    expect(out.function.name).toBe('web_search')
    expect(out.function.parameters).toEqual({ ...(web.function.parameters as object), properties: { query: { type: 'string', description: 'Kata pencarian' } } })
    expect(web.function.description).toContain('Search the internet')   // the shipped definition is never mutated
  })

  it('returns the very same array when nothing actually changes', () => {
    expect(applyOverrides(defs, {})).toBe(defs)
    expect(applyOverrides(defs, { web_search: { description: '   ' } })).toBe(defs)
    expect(applyOverrides(defs, { web_search: { description: web.function.description } })).not.toBe(defs)   // same text is still an override
    expect(applyOverrides(defs, { not_a_tool: { description: 'x' } })).toBe(defs)
    expect(applyOverrides(defs, { web_search: { params: { nope: 'x' } } })).toBe(defs)
  })

  it('treats blank as "use the built-in wording"', () => {
    expect(cleanOverride({ description: ' ', params: { query: '' } })).toBeUndefined()
    expect(cleanOverride({ description: 'x', params: { query: '' } })).toEqual({ description: 'x' })
    expect(cleanOverride({ params: { query: 'y' } })).toEqual({ params: { query: 'y' } })
  })

  it('marks a card only when the wording differs from the shipped one', () => {
    expect(isModified(web, undefined)).toBe(false)
    expect(isModified(web, { description: '  ' })).toBe(false)
    expect(isModified(web, { description: 'Cari.' })).toBe(true)
    expect(isModified(web, { description: web.function.description })).toBe(false)
    expect(isModified(web, { params: { nope: 'x' } })).toBe(false)
    expect(isModified(web, { params: { query: 'Kata pencarian' } })).toBe(true)
  })

  it('keeps only usable overrides after a restart', () => {
    expect(readOverrides(null)).toEqual({})
    expect(readOverrides({ tools: 'nope' })).toEqual({})
    expect(readOverrides(JSON.parse(JSON.stringify({ tools: {
      web_search: { description: 'Cari.', params: { query: 'Kata', '': 'x', bad: 5 } },
      read_url: { description: '   ' },
    } })))).toEqual({ web_search: { description: 'Cari.', params: { query: 'Kata' } } })
  })
})

describe('tool schema store', () => {
  it('stores, resets and remembers the wording', () => {
    useToolSchema.setState({ tools: {} })
    const s = () => useToolSchema.getState()
    s().setDescription('web_search', 'Cari di internet.')
    s().setParam('web_search', 'query', 'Kata pencarian')
    expect(s().tools.web_search).toEqual({ description: 'Cari di internet.', params: { query: 'Kata pencarian' } })
    expect(applyOverrides([web], s().tools)[0].function.description).toBe('Cari di internet.')
    s().resetTool('web_search')
    expect(s().tools).toEqual({})
    s().setDescription('read_url', 'Buka halaman.')
    expect(JSON.parse(require('expo-sqlite/kv-store').default.getItemSync('bc.tools.v1')).tools.read_url.description).toBe('Buka halaman.')
    s().setDescription('read_url', '  ')
    expect(s().tools).toEqual({})
  })
})
