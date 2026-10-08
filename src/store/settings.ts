import Storage from 'expo-sqlite/kv-store'
import { getLocales } from 'expo-localization'
import { create } from 'zustand'
import { detectLang, type Lang } from '../i18n/strings'

export type ThemePref = 'auto' | 'light' | 'dark'
const K = { lang: 'bc.lang', theme: 'bc.theme', model: 'bc.model' }
const read = (k: string): string | null => { try { return Storage.getItemSync(k) } catch { return null } }
const write = (k: string, v: string) => { try { Storage.setItemSync(k, v) } catch { /* private storage unavailable: the setting just does not persist */ } }

interface SettingsState { lang: Lang; theme: ThemePref; model: string | null; setLang(l: Lang): void; setTheme(t: ThemePref): void; setModel(id: string): void }
const savedTheme = read(K.theme)

export const useSettings = create<SettingsState>(set => ({
  lang: detectLang(read(K.lang), getLocales()[0]?.languageCode ?? undefined),
  theme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'auto',
  model: read(K.model),
  setLang: lang => { write(K.lang, lang); set({ lang }) },
  setTheme: theme => { write(K.theme, theme); set({ theme }) },
  setModel: model => { write(K.model, model); set({ model }) },
}))
