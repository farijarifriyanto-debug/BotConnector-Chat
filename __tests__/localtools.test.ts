import './helpers/mocks'
import { evaluate, formatNumber, isLocalTool, memoryId, runLocalTool, MEMORY_MAX, MEMORY_ITEM_MAX, type ChatHit, type LocalContext } from '../src/lib/tools/local'

const setup = (facts: string[] = []) => {
  let memory = [...facts], clip = 'isi papan klip'
  const spoken: string[] = [], calls: { query: string; limit: number; only?: string }[] = []
  let chats: ChatHit[] = []
  const ctx: LocalContext = {
    memory: () => memory,
    saveMemory: async next => { memory = next },
    clipboardRead: async () => clip,
    clipboardWrite: async text => { clip = text },
    speak: text => { spoken.push(text) },
    searchChats: (query, limit, only) => { calls.push({ query, limit, only }); return chats.slice(0, limit) },
  }
  return { ctx, facts: () => memory, clip: () => clip, spoken, calls, setChats: (hits: ChatHit[]) => { chats = hits } }
}
const call = async (name: string, args: Record<string, unknown>, ctx: LocalContext) => JSON.parse(await runLocalTool(name, args, ctx))

describe('memory tools', () => {
  it('gives every fact a stable id', () => {
    expect(memoryId('Suka kopi')).toBe(memoryId('Suka kopi'))
    expect(memoryId('Suka kopi')).toMatch(/^mem_[0-9a-f]{8}$/)
    expect(memoryId('Suka teh')).not.toBe(memoryId('Suka kopi'))
  })

  it('reads what is stored', async () => {
    const { ctx } = setup(['Suka kopi', 'Tinggal di Bandung'])
    const out = await call('memory_read', {}, ctx)
    expect(out.total).toBe(2)
    expect(out.entries).toEqual([
      { id: memoryId('Suka kopi'), content: 'Suka kopi' },
      { id: memoryId('Tinggal di Bandung'), content: 'Tinggal di Bandung' },
    ])
  })

  it('saves a fact once, trims it and refuses an empty one', async () => {
    const { ctx, facts } = setup(['Suka kopi'])
    expect(await call('memory_update', { content: '  Suka kopi  ' }, ctx)).toMatchObject({ saved: false })
    expect(facts()).toEqual(['Suka kopi'])
    expect(await call('memory_update', { content: '   ' }, ctx)).toHaveProperty('error')
    const long = 'x'.repeat(MEMORY_ITEM_MAX + 50)
    const out = await call('memory_update', { content: long }, ctx)
    expect(out.saved).toBe(true)
    expect(facts()[1]).toHaveLength(MEMORY_ITEM_MAX)
  })

  it('keeps the list at its cap', async () => {
    const { ctx, facts } = setup(Array.from({ length: MEMORY_MAX }, (_, i) => `fakta ${i}`))
    await call('memory_update', { content: 'fakta baru' }, ctx)
    expect(facts()).toHaveLength(MEMORY_MAX)
    expect(facts().at(-1)).toBe('fakta baru')
    expect(facts()[0]).toBe('fakta 1')
  })

  it('edits and deletes by id, and refuses an unknown id', async () => {
    const { ctx, facts } = setup(['Suka kopi', 'Tinggal di Bandung'])
    const id = memoryId('Suka kopi')
    expect(await call('memory_edit', { id, content: 'Suka teh' }, ctx)).toMatchObject({ saved: true })
    expect(facts()).toEqual(['Suka teh', 'Tinggal di Bandung'])
    expect(await call('memory_delete', { id: memoryId('Suka teh') }, ctx)).toMatchObject({ removed: true, total: 1 })
    expect(facts()).toEqual(['Tinggal di Bandung'])
    expect(await call('memory_delete', { id: 'mem_00000000' }, ctx)).toHaveProperty('error')
    expect(await call('memory_edit', { id } , ctx)).toHaveProperty('error')
  })
})

describe('device tools', () => {
  it('reports the phone clock', async () => {
    const { ctx } = setup()
    const out = await call('get_time_info', {}, ctx)
    const now = new Date()
    expect(out.year).toBe(now.getFullYear())
    expect(out.month).toBe(now.getMonth() + 1)
    expect(out.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(out.isoTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(out.utcOffset).toMatch(/^[+-]\d{2}:\d{2}$/)
    expect(typeof out.timestamp).toBe('number')
  })

  it('reads and writes the clipboard, and needs text for a write', async () => {
    const { ctx, clip } = setup()
    expect(await call('clipboard_tool', { action: 'read' }, ctx)).toEqual({ text: 'isi papan klip' })
    expect(await call('clipboard_tool', { action: 'write', text: 'halo' }, ctx)).toEqual({ written: true, length: 4 })
    expect(clip()).toBe('halo')
    expect(await call('clipboard_tool', { action: 'write' }, ctx)).toHaveProperty('error')
    expect(await call('clipboard_tool', { action: 'nope' }, ctx)).toHaveProperty('error')
  })

  it('calculates with precedence, powers, factorials, functions and constants', async () => {
    expect(evaluate('(15 + 3) * 2')).toBe(36)
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('2^10')).toBe(1024)
    expect(evaluate('2^3^2')).toBe(512)          // right associative
    expect(evaluate('5!')).toBe(120)
    expect(evaluate('7 % 4')).toBe(3)
    expect(evaluate('sqrt(144)')).toBe(12)
    expect(evaluate('log(2, 8)')).toBeCloseTo(3, 10)
    expect(evaluate('floor(3.7)')).toBe(3)
    expect(evaluate('-3 + 5')).toBe(2)
    expect(evaluate('sin(pi/2)')).toBeCloseTo(1, 10)
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(1024)).toBe('1024')
  })

  it('explains what it cannot do instead of guessing', async () => {
    const { ctx } = setup()
    expect(await call('calculate', { expression: '1/0' }, ctx)).toHaveProperty('error')
    expect(await call('calculate', { expression: 'sqrt(-1)' }, ctx)).toHaveProperty('error')
    expect(await call('calculate', { expression: '1 +' }, ctx)).toHaveProperty('error')
    expect(await call('calculate', { expression: 'nope(3)' }, ctx)).toHaveProperty('error')
    expect(await call('calculate', { expression: '' }, ctx)).toHaveProperty('error')
    expect(await call('calculate', { expression: '2^' }, ctx)).toHaveProperty('error')
  })

  it('knows which names belong to Memory and Device tools', () => {
    expect(['memory_read', 'memory_update', 'memory_edit', 'memory_delete', 'memory_search_profile', 'chat_search', 'get_time_info', 'clipboard_tool', 'text_to_speech', 'calculate'].every(isLocalTool)).toBe(true)
    expect(isLocalTool('search_web')).toBe(false)
    expect(isLocalTool('fetch_url')).toBe(false)
  })
})

describe('memory search and past chats', () => {
  it('finds facts that contain every keyword, ignoring case, and caps the page at 20', async () => {
    const { ctx } = setup(['Suka KOPI tubruk', 'Suka kopi susu', 'Tinggal di Bandung'])
    expect((await call('memory_search_profile', { query: 'kopi' }, ctx)).entries).toHaveLength(2)
    const both = await call('memory_search_profile', { query: 'suka susu' }, ctx)
    expect(both.total).toBe(1)
    expect(both.entries[0].content).toBe('Suka kopi susu')
    expect((await call('memory_search_profile', { query: 'teh' }, ctx)).total).toBe(0)
    expect(await call('memory_search_profile', { query: '  ' }, ctx)).toHaveProperty('error')
    const many = setup(Array.from({ length: 40 }, (_, i) => `kopi ${i}`))
    expect((await call('memory_search_profile', { query: 'kopi', limit: 99 }, many.ctx)).entries).toHaveLength(20)
    expect((await call('memory_search_profile', { query: 'kopi' }, many.ctx)).entries).toHaveLength(10)
  })

  it('asks the chat store for past conversations and shapes the answer', async () => {
    const h = setup()
    h.setChats([{ conversationId: 'c9', title: 'Rencana VPS', updatedAt: Date.parse('2026-10-20T10:00:00Z'), snippets: ['VPS 8GB Rp50rb'] }])
    const out = await call('chat_search', { query: 'vps harga', limit: 5 }, h.ctx)
    expect(h.calls[0]).toEqual({ query: 'vps harga', limit: 5, only: undefined })
    expect(out.total).toBe(1)
    expect(out.results[0]).toEqual({ conversation_id: 'c9', title: 'Rencana VPS', updated_at: '2026-10-20T10:00:00.000Z', snippets: ['VPS 8GB Rp50rb'] })
    await call('chat_search', { query: 'vps', conversation_id: 'c9' }, h.ctx)
    expect(h.calls[1]).toEqual({ query: 'vps', limit: 10, only: 'c9' })
    expect(await call('chat_search', { query: '' }, h.ctx)).toHaveProperty('error')
  })

  it('speaks the text and needs some', async () => {
    const h = setup()
    expect(await call('text_to_speech', { text: 'Halo, ini dibacakan.' }, h.ctx)).toEqual({ spoken: true, characters: 20 })
    expect(h.spoken).toEqual(['Halo, ini dibacakan.'])
    expect(await call('text_to_speech', { text: '  ' }, h.ctx)).toHaveProperty('error')
    expect(h.spoken).toHaveLength(1)
  })
})
