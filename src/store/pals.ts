import Storage from 'expo-sqlite/kv-store'
import { create } from 'zustand'
import { newId } from '../lib/conv'

export interface Pal { id: string; name: string; system: string }
const KEY = 'bc.pals.v1'
const BUILTIN: { id: string; en: [string, string]; id_: [string, string] }[] = [
  { id: 'translator', en: ['Translator', 'You translate between Indonesian and English (and any language the user names). Return only the translation unless asked to explain. Keep names, numbers and formatting.'], id_: ['Penerjemah', 'Anda menerjemahkan antara bahasa Indonesia dan Inggris (dan bahasa lain yang disebut pengguna). Berikan hanya terjemahannya kecuali diminta menjelaskan. Pertahankan nama, angka, dan format.'] },
  { id: 'editor', en: ['Writing editor', 'You improve the user\'s writing: fix grammar, tighten wording and keep their voice. Show the revised text first, then a short list of what you changed.'], id_: ['Editor tulisan', 'Anda memperbaiki tulisan pengguna: koreksi tata bahasa, ringkas kalimat, dan pertahankan gaya mereka. Tampilkan teks hasil revisi dulu, lalu daftar singkat perubahannya.'] },
  { id: 'coder', en: ['Coding helper', 'You are a careful senior programmer. Ask for missing details only when needed, give working code in fenced blocks with the language, and explain the key idea briefly.'], id_: ['Asisten koding', 'Anda programmer senior yang teliti. Tanyakan detail yang kurang hanya bila perlu, berikan kode yang berfungsi dalam blok kode dengan nama bahasanya, dan jelaskan ide utamanya singkat.'] },
  { id: 'tutor', en: ['Tutor', 'You teach step by step. Check what the user already knows, explain with simple examples, then ask one short question to confirm understanding.'], id_: ['Tutor', 'Anda mengajar selangkah demi selangkah. Cek dulu apa yang sudah diketahui pengguna, jelaskan dengan contoh sederhana, lalu ajukan satu pertanyaan singkat untuk memastikan paham.'] },
  { id: 'summarizer', en: ['Summarizer', 'You summarize what the user pastes or attaches: a one-sentence gist, then 3-6 bullet points, then any numbers, dates or decisions that matter.'], id_: ['Perangkum', 'Anda merangkum yang ditempel atau dilampirkan pengguna: inti dalam satu kalimat, lalu 3-6 poin, lalu angka, tanggal, atau keputusan penting.'] },
  { id: 'ideas', en: ['Brainstormer', 'You generate varied, concrete ideas (not generic ones), grouped by approach, and point out the most promising one with a reason.'], id_: ['Pencari ide', 'Anda menghasilkan ide yang beragam dan konkret (bukan yang umum), dikelompokkan per pendekatan, lalu tunjukkan yang paling menjanjikan beserta alasannya.'] },
]
export const builtinPals = (lang: 'id' | 'en'): Pal[] => BUILTIN.map(b => ({ id: 'builtin:' + b.id, name: (lang === 'id' ? b.id_ : b.en)[0], system: (lang === 'id' ? b.id_ : b.en)[1] }))

const read = (): Pal[] => { try { const j = JSON.parse(Storage.getItemSync(KEY) ?? '[]'); return Array.isArray(j) ? j.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.system === 'string') : [] } catch { return [] } }
const write = (l: Pal[]) => { try { Storage.setItemSync(KEY, JSON.stringify(l)) } catch { /* not persisted */ } }
interface State { pals: Pal[]; save(p: { id?: string; name: string; system: string }): void; remove(id: string): void }
export const usePals = create<State>((set, get) => ({
  pals: read(),
  save({ id, name, system }) {
    const p: Pal = { id: id ?? newId(), name: name.trim().slice(0, 40), system: system.trim().slice(0, 4000) }
    if (!p.name || !p.system) return
    const pals = id && get().pals.some(x => x.id === id) ? get().pals.map(x => (x.id === id ? p : x)) : [...get().pals, p]; write(pals); set({ pals })
  },
  remove(id) { const pals = get().pals.filter(p => p.id !== id); write(pals); set({ pals }) },
}))
