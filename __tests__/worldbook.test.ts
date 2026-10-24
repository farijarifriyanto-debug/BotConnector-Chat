import './helpers/mocks'
import Storage from 'expo-sqlite/kv-store'
import { activatedEntries, applyLore, entryMatches, newEntry, readBooks, splitKeywords, type LoreEntry, type WorldBook } from '../src/lib/worldbook'
import { useWorldBook } from '../src/store/worldbook'
import type { ApiMessage } from '../src/lib/agent'

const lore = (patch: Partial<LoreEntry>): LoreEntry => ({ ...newEntry(), id: 'e1', content: 'Kopi tumbuh di dataran tinggi.', ...patch })
const book = (entries: LoreEntry[], patch: Partial<WorldBook> = {}): WorldBook => ({ id: 'b1', name: 'Fakta', description: '', enabled: true, entries, ...patch })
const chat: ApiMessage[] = [
  { role: 'system', content: 'You are a helper.' },
  { role: 'user', content: 'Ceritakan soal kopi.' },
  { role: 'assistant', content: 'Kopi arabika...' },
  { role: 'user', content: 'Bagaimana panennya?' },
]

beforeEach(() => { useWorldBook.setState({ books: [], active: [] }) })

describe('world book matching', () => {
  it('matches keywords case-insensitively unless asked otherwise', () => {
    expect(entryMatches(lore({ keywords: ['kopi'] }), 'Ceritakan soal KOPI.')).toBe(true)
    expect(entryMatches(lore({ keywords: ['kopi'], caseSensitive: true }), 'Ceritakan soal KOPI.')).toBe(false)
    expect(entryMatches(lore({ keywords: ['kopi'], caseSensitive: true }), 'soal kopi')).toBe(true)
    expect(entryMatches(lore({ keywords: ['teh', 'kopi'] }), 'kopi')).toBe(true)
    expect(entryMatches(lore({ keywords: ['teh'] }), 'kopi')).toBe(false)
    expect(entryMatches(lore({ keywords: [] }), 'kopi')).toBe(false)
  })

  it('supports regex and survives a broken expression', () => {
    expect(entryMatches(lore({ keywords: ['kop[iy]'], useRegex: true }), 'kopi')).toBe(true)
    expect(entryMatches(lore({ keywords: ['KO PI'], useRegex: true }), 'ko pi')).toBe(true)
    expect(entryMatches(lore({ keywords: ['([', 'kopi'] }), 'kopi')).toBe(true)
    expect(entryMatches(lore({ keywords: ['('], useRegex: true }), 'kopi')).toBe(false)
  })

  it('always fires when "always on", never when the entry is off', () => {
    expect(entryMatches(lore({ constantActive: true }), '')).toBe(true)
    expect(entryMatches(lore({ constantActive: true, enabled: false }), 'kopi')).toBe(false)
  })

  it('searches only the last scanDepth messages', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'kopi' },
      { role: 'assistant', content: 'ya' },
      { role: 'user', content: 'hal lain' },
    ]
    expect(activatedEntries([book([lore({ keywords: ['kopi'], scanDepth: 3 })])], messages)).toHaveLength(1)
    expect(activatedEntries([book([lore({ keywords: ['kopi'], scanDepth: 1 })])], messages)).toHaveLength(0)
  })

  it('orders by priority and skips switched-off books and empty entries', () => {
    const low = lore({ id: 'low', keywords: ['kopi'], priority: 0 })
    const high = lore({ id: 'high', keywords: ['kopi'], priority: 5 })
    const empty = lore({ id: 'empty', keywords: ['kopi'], content: '   ' })
    expect(activatedEntries([book([low, high, empty])], chat).map(e => e.id)).toEqual(['high', 'low'])
    expect(activatedEntries([book([low], { enabled: false })], chat)).toEqual([])
    expect(activatedEntries([book([{ ...low, enabled: false }])], chat)).toEqual([])
  })

  it('splits keywords on commas and new lines', () => {
    expect(splitKeywords(' kopi, senja \n teh ,,')).toEqual(['kopi', 'senja', 'teh'])
  })
})

describe('world book injection', () => {
  it('merges after-system lore into the system message, as plain text like the reference', () => {
    const out = applyLore(chat, [lore({ content: 'Kopi tumbuh di dataran tinggi.' })])
    expect(out[0]).toEqual({ role: 'system', content: 'You are a helper.\nKopi tumbuh di dataran tinggi.' })
    expect(out).toHaveLength(chat.length)
  })

  it('prepends before-system lore and keeps both sides in one system message', () => {
    const out = applyLore(chat, [
      lore({ id: 'a', position: 'beforeSystem', content: 'Awal.' }),
      lore({ id: 'b', position: 'afterSystem', content: 'Akhir.' }),
    ])
    expect(out[0].content).toBe('Awal.\nYou are a helper.\nAkhir.')
  })

  it('creates a system message when the chat has none', () => {
    const out = applyLore([{ role: 'user', content: 'hai' }], [lore({ position: 'beforeSystem', content: 'Awal.' })])
    expect(out[0]).toEqual({ role: 'system', content: 'Awal.' })
  })

  it('puts top-of-chat lore before the first user message and bottom lore before the last message', () => {
    const top = applyLore(chat, [lore({ position: 'topOfChat', content: 'Atas.' })])
    expect(top[1]).toEqual({ role: 'user', content: '<system>\nAtas.\n</system>' })
    const bottom = applyLore(chat, [lore({ position: 'bottomOfChat', content: 'Bawah.' })])
    expect(bottom[bottom.length - 2]).toEqual({ role: 'user', content: '<system>\nBawah.\n</system>' })
    expect(bottom[bottom.length - 1]).toEqual(chat[chat.length - 1])
  })

  it('sends assistant lore as plain text and tags user lore when it becomes its own message', () => {
    const out = applyLore(chat, [
      lore({ id: 'a', position: 'topOfChat', role: 'assistant', content: 'Catatan satu.' }),
      lore({ id: 'b', position: 'topOfChat', role: 'assistant', content: 'Catatan dua.' }),
      lore({ id: 'c', position: 'topOfChat', role: 'user', content: 'Catatan tiga.' }),
    ])
    expect(out[1]).toEqual({ role: 'assistant', content: 'Catatan satu.\nCatatan dua.' })
    expect(out[2]).toEqual({ role: 'user', content: '<system>\nCatatan tiga.\n</system>' })
    expect(out[3]).toEqual(chat[1])
  })

  it('inserts at the requested depth, counting from the end', () => {
    const at = (depth: number) => applyLore(chat, [lore({ position: 'atDepth', injectDepth: depth, content: 'Kedalaman.' })]).map(m => String(m.content))
    expect(at(1)[3]).toBe('<system>\nKedalaman.\n</system>')       // just before the last message
    expect(at(0)[4]).toBe('<system>\nKedalaman.\n</system>')       // after it
    expect(at(99)[1]).toBe('<system>\nKedalaman.\n</system>')      // clamped to the start of the history
  })

  it('leaves the request alone when nothing fired', () => {
    expect(applyLore(chat, [])).toEqual(chat)
  })
})

describe('world book store', () => {
  it('keeps books, entries and the switch, and remembers them', () => {
    const s = () => useWorldBook.getState()
    const id = s().addBook('Fakta')
    expect(s().books).toHaveLength(1)
    expect(s().active).toEqual([id])            // a new book is on, like the reference

    const eid = s().addEntry(id)
    s().updateEntry(id, eid, { name: 'Kopi', keywords: ['kopi'], content: 'Tumbuh di dataran tinggi.' })
    const entry = s().books[0].entries[0]
    expect(entry).toMatchObject({ id: eid, name: 'Kopi', keywords: ['kopi'], position: 'afterSystem', role: 'user', scanDepth: 4 })

    s().toggleBook(id)
    expect(s().active).toEqual([])
    expect(JSON.parse(Storage.getItemSync('bc.wb.v1') ?? '{}').active).toEqual([])

    s().removeEntry(id, eid)
    expect(s().books[0].entries).toEqual([])
    s().removeBook(id)
    expect(s().books).toEqual([])
  })

  it('drops damaged rows when reading the blob back', () => {
    expect(readBooks(null)).toEqual([])
    expect(readBooks({ books: 'nope' })).toEqual([])
    const books = readBooks({ books: [
      { id: 'b1', name: 'ok', entries: [{ id: 'e1', position: 'BOTTOM', keywords: ['x', 5, '  '] }, { name: 'no id' }] },
      { name: 'no id' },
    ] })
    expect(books).toHaveLength(1)
    expect(books[0].entries[0]).toMatchObject({ id: 'e1', position: 'afterSystem', keywords: ['x'], role: 'user' })
  })
})
