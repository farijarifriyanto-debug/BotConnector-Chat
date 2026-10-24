import Storage from 'expo-sqlite/kv-store'
import { getLocales } from 'expo-localization'
import { create } from 'zustand'
import { detectLang, type Lang } from '../i18n/strings'

export type ThemePref = 'auto' | 'light' | 'dark'
const K = { lang: 'bc.lang', theme: 'bc.theme', model: 'bc.model', font: 'bc.font', msgMeta: 'bc.msgMeta' }
const read = (k: string): string | null => { try { return Storage.getItemSync(k) } catch { return null } }
const write = (k: string, v: string) => { try { Storage.setItemSync(k, v) } catch { /* private storage unavailable: the setting just does not persist */ } }

interface SettingsState { lang: Lang; theme: ThemePref; model: string | null; fontScale: number; msgMeta: boolean; setFontScale(k: number): void; setLang(l: Lang): void; setTheme(t: ThemePref): void; setModel(id: string): void; setMsgMeta(v: boolean): void }
const savedTheme = read(K.theme)

export const useSettings = create<SettingsState>(set => ({
  lang: detectLang(read(K.lang), getLocales()[0]?.languageCode ?? undefined),
  theme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'auto',
  model: read(K.model),
  fontScale: ((n) => ([0.9, 1, 1.15, 1.3].includes(n) ? n : 1))(Number(read(K.font))),
  /** Names, avatars and times above each message (on by default, like the reference app). */
  msgMeta: read(K.msgMeta) !== '0',
  setFontScale: fontScale => { write(K.font, String(fontScale)); set({ fontScale }) },
  setLang: lang => { write(K.lang, lang); set({ lang }) },
  setTheme: theme => { write(K.theme, theme); set({ theme }) },
  setModel: model => { write(K.model, model); set({ model }) },
  setMsgMeta: msgMeta => { write(K.msgMeta, msgMeta ? '1' : '0'); set({ msgMeta }) },
}))
