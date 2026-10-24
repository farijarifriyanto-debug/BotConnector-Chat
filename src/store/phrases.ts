import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { newId } from '../lib/conv'
import { readPhrases, type QuickPhrase } from '../lib/phrases'

const KEY = 'bc.phrases.v1'
const read = (): QuickPhrase[] => {
  try { return readPhrases(JSON.parse(Storage.getItemSync(KEY) ?? '[]')) } catch { return [] }
}
const write = (phrases: QuickPhrase[]) => { try { Storage.setItemSync(KEY, JSON.stringify(phrases)) } catch { /* the phrases just do not persist */ } }

interface State {
  phrases: QuickPhrase[]
  add(title: string, content: string): void
  update(id: string, patch: Partial<Pick<QuickPhrase, 'title' | 'content'>>): void
  remove(id: string): void
  /** Moves one row up (-1) or down (+1); the ends do nothing. */
  move(id: string, direction: -1 | 1): void
}

export const usePhrases = create<State>((set, get) => {
  const commit = (phrases: QuickPhrase[]) => { write(phrases); set({ phrases }) }
  return {
    phrases: read(),
    add(title, content) {
      const t = title.trim().slice(0, 120), c = content.trim().slice(0, 8000)
      if (!t || !c) return   // both are required, silently, like the reference app
      commit([...get().phrases, { id: newId(), title: t, content: c }])
    },
    update(id, patch) {
      const cur = get().phrases.find(p => p.id === id)
      if (!cur) return
      const title = patch.title !== undefined ? patch.title.trim().slice(0, 120) : cur.title
      const content = patch.content !== undefined ? patch.content.trim().slice(0, 8000) : cur.content
      if (!title || !content) return
      commit(get().phrases.map(p => (p.id === id ? { ...p, title, content } : p)))
    },
    remove(id) { commit(get().phrases.filter(p => p.id !== id)) },
    move(id, direction) {
      const list = [...get().phrases], at = list.findIndex(p => p.id === id), to = at + direction
      if (at < 0 || to < 0 || to >= list.length) return
      const [row] = list.splice(at, 1)
      list.splice(to, 0, row)
      commit(list)
    },
  }
})
