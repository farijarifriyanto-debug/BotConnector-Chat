import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'

const KEY = 'bc.ratings.v1', KEEP = 500
type Marks = Record<string, 1>
const read = (): { up: Marks; down: Marks } => { try { const j = JSON.parse(Storage.getItemSync(KEY) ?? '{}'); return { up: j?.up && typeof j.up === 'object' ? j.up : {}, down: j?.down && typeof j.down === 'object' ? j.down : {} } } catch { return { up: {}, down: {} } } }
const trim = (m: Marks): Marks => { const k = Object.keys(m); return k.length <= KEEP ? m : Object.fromEntries(k.slice(-KEEP).map(x => [x, 1 as const])) }

/** Thumbs on replies. Kept on this phone only: a thumbs-up is a personal marker, a thumbs-down is set once the report has been sent. */
interface State { up: Marks; down: Marks; toggleUp(id: string): void; markDown(id: string): void }
export const useRatings = create<State>((set, get) => {
  const save = () => { try { Storage.setItemSync(KEY, JSON.stringify({ up: get().up, down: get().down })) } catch { /* the marker is just not remembered */ } }
  return {
    ...read(),
    toggleUp(id) { set(s => { const up = { ...s.up }; if (up[id]) delete up[id]; else up[id] = 1; return { up: trim(up) } }); save() },
    markDown(id) { set(s => ({ down: trim({ ...s.down, [id]: 1 }) })); save() },
  }
})
