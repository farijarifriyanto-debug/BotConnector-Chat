import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { cleanOverride, readOverrides, type ToolOverride } from '../lib/toolSchema'

const KEY = 'bc.tools.v1'
const read = (): Record<string, ToolOverride> => {
  try { return readOverrides(JSON.parse(Storage.getItemSync(KEY) ?? '{}')) } catch { return {} }
}
const write = (tools: Record<string, ToolOverride>) => { try { Storage.setItemSync(KEY, JSON.stringify({ tools })) } catch { /* the wording just does not persist */ } }

interface State {
  /** tool name -> wording the person wrote; an absent entry means the built-in text */
  tools: Record<string, ToolOverride>
  setDescription(name: string, text: string): void
  setParam(name: string, path: string, text: string): void
  /** back to the built-in wording for one tool */
  resetTool(name: string): void
  /** the sheet keeps its own draft and hands the whole map over once the typing settles */
  replaceAll(tools: Record<string, ToolOverride>): void
}

export const useToolSchema = create<State>((set, get) => {
  const commit = (tools: Record<string, ToolOverride>) => { write(tools); set({ tools }) }
  const patch = (name: string, change: (o: ToolOverride) => ToolOverride) => {
    const next = { ...get().tools }
    const clean = cleanOverride(change(next[name] ?? {}))
    if (clean) next[name] = clean
    else delete next[name]
    commit(next)
  }
  return {
    tools: read(),
    setDescription(name, text) { patch(name, o => ({ ...o, description: text })) },
    setParam(name, path, text) { patch(name, o => ({ ...o, params: { ...(o.params ?? {}), [path]: text } })) },
    resetTool(name) { const next = { ...get().tools }; delete next[name]; commit(next) },
    replaceAll(tools) {
      const clean: Record<string, ToolOverride> = {}
      for (const [name, o] of Object.entries(tools)) { const c = cleanOverride(o); if (c) clean[name] = c }
      commit(clean)
    },
  }
})
