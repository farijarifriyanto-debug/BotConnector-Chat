import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { newId } from '../lib/conv'
import { INSTR_MAX, INSTR_PROMPT_MAX, INSTR_TITLE_MAX, instructionPrompt, readInstructions, type Instruction } from '../lib/instructions'

const KEY = 'bc.instr.v1'
const read = (): { items: Instruction[]; active: string[] } => {
  try {
    const j = JSON.parse(Storage.getItemSync(KEY) ?? '{}')
    const items = readInstructions(j)
    const ids = new Set(items.map(i => i.id))
    const active = Array.isArray(j?.active) ? j.active.filter((x: unknown): x is string => typeof x === 'string' && ids.has(x)) : []
    return { items, active }
  } catch { return { items: [], active: [] } }
}
const write = (v: { items: Instruction[]; active: string[] }) => { try { Storage.setItemSync(KEY, JSON.stringify(v)) } catch { /* the cards just do not persist */ } }
const saved = read()

interface State {
  items: Instruction[]
  /** ids of the cards switched on; their prompts ride along with every request */
  active: string[]
  add(title: string, prompt: string): string
  update(id: string, patch: Partial<Pick<Instruction, 'title' | 'prompt'>>): void
  remove(id: string): void
  toggle(id: string): void
  setActive(ids: string[]): void
}

export const useInstructions = create<State>((set, get) => {
  const commit = (next: { items: Instruction[]; active: string[] }) => { write(next); set(next) }
  return {
    ...saved,
    add(title, prompt) {
      const item: Instruction = { id: newId(), title: title.slice(0, INSTR_TITLE_MAX), prompt: prompt.slice(0, INSTR_PROMPT_MAX) }
      const items = [...get().items, item].slice(-INSTR_MAX)
      commit({ items, active: get().active.filter(id => items.some(i => i.id === id)) })
      return item.id
    },
    update(id, patch) {
      commit({
        items: get().items.map(i => i.id === id
          ? { ...i, title: (patch.title ?? i.title).slice(0, INSTR_TITLE_MAX), prompt: (patch.prompt ?? i.prompt).slice(0, INSTR_PROMPT_MAX) }
          : i),
        active: get().active,
      })
    },
    remove(id) {
      commit({ items: get().items.filter(i => i.id !== id), active: get().active.filter(x => x !== id) })
    },
    toggle(id) {
      const active = get().active
      commit({ items: get().items, active: active.includes(id) ? active.filter(x => x !== id) : [...active, id] })
    },
    setActive(ids) {
      const keep = new Set(get().items.map(i => i.id))
      commit({ items: get().items, active: [...new Set(ids)].filter(id => keep.has(id)) })
    },
  }
})

/** What the next request appends to its system message. */
export const instructionBlock = (): string => {
  const s = useInstructions.getState()
  return instructionPrompt(s.items, s.active)
}
