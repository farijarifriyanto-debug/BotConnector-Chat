import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { newId } from '../lib/conv'
import { readBooks, type LoreEntry, type WorldBook } from '../lib/worldbook'

const KEY = 'bc.wb.v1'
const read = (): { books: WorldBook[]; active: string[] } => {
  try {
    const j = JSON.parse(Storage.getItemSync(KEY) ?? '{}')
    const books = readBooks(j)
    const ids = new Set(books.map(b => b.id))
    const active = Array.isArray(j?.active) ? j.active.filter((x: unknown): x is string => typeof x === 'string' && ids.has(x)) : []
    return { books, active }
  } catch { return { books: [], active: [] } }
}
const write = (v: { books: WorldBook[]; active: string[] }) => { try { Storage.setItemSync(KEY, JSON.stringify(v)) } catch { /* the books just do not persist */ } }
const saved = read()

interface State {
  books: WorldBook[]
  /** books switched on; only their entries can fire */
  active: string[]
  addBook(name: string): string
  updateBook(id: string, patch: Partial<Pick<WorldBook, 'name' | 'description' | 'enabled'>>): void
  removeBook(id: string): void
  toggleBook(id: string): void
  addEntry(bookId: string): string
  updateEntry(bookId: string, entryId: string, patch: Partial<LoreEntry>): void
  removeEntry(bookId: string, entryId: string): void
}

export const useWorldBook = create<State>((set, get) => {
  const commit = (next: { books: WorldBook[]; active: string[] }) => { write(next); set(next) }
  const mapBook = (id: string, fn: (b: WorldBook) => WorldBook) =>
    get().books.map(b => (b.id === id ? fn(b) : b))
  return {
    ...saved,
    addBook(name) {
      const book: WorldBook = { id: newId(), name: name.slice(0, 120), description: '', enabled: true, entries: [] }
      commit({ books: [...get().books, book], active: [...get().active, book.id] })
      return book.id
    },
    updateBook(id, patch) {
      commit({ books: mapBook(id, b => ({ ...b, ...patch })), active: get().active })
    },
    removeBook(id) {
      commit({ books: get().books.filter(b => b.id !== id), active: get().active.filter(x => x !== id) })
    },
    toggleBook(id) {
      const active = get().active
      commit({ books: get().books, active: active.includes(id) ? active.filter(x => x !== id) : [...active, id] })
    },
    addEntry(bookId) {
      const entry: LoreEntry = { id: newId(), name: '', enabled: true, priority: 0, position: 'afterSystem', content: '', injectDepth: 4, role: 'user', keywords: [], useRegex: false, caseSensitive: false, scanDepth: 4, constantActive: false }
      commit({ books: mapBook(bookId, b => ({ ...b, entries: [...b.entries, entry] })), active: get().active })
      return entry.id
    },
    updateEntry(bookId, entryId, patch) {
      commit({ books: mapBook(bookId, b => ({ ...b, entries: b.entries.map(e => (e.id === entryId ? { ...e, ...patch } : e)) })), active: get().active })
    },
    removeEntry(bookId, entryId) {
      commit({ books: mapBook(bookId, b => ({ ...b, entries: b.entries.filter(e => e.id !== entryId) })), active: get().active })
    },
  }
})

/** The books whose entries may fire for the next request. */
export const activeBooks = (): WorldBook[] => {
  const s = useWorldBook.getState()
  return s.books.filter(b => s.active.includes(b.id))
}
