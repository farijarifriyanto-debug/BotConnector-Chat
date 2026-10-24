import Storage from 'expo-sqlite/kv-store'
import { getLocales } from 'expo-localization'
import { create } from 'zustand'
import { detectLang, type Lang } from '../i18n/strings'

export type ThemePref = 'auto' | 'light' | 'dark'
const K = { lang: 'bc.lang', theme: 'bc.theme', model: 'bc.model', font: 'bc.font', msgMeta: 'bc.msgMeta', toolsMem: 'bc.toolsMem', toolsDev: 'bc.toolsDev', toolsRecall: 'bc.toolsRecall' }
const read = (k: string): string | null => { try { return Storage.getItemSync(k) } catch { return null } }
const write = (k: string, v: string) => { try { Storage.setItemSync(k, v) } catch { /* private storage unavailable: the setting just does not persist */ } }

interface SettingsState { lang: Lang; theme: ThemePref; model: string | null; fontScale: number; msgMeta: boolean; toolsMemory: boolean; toolsDevice: boolean; toolsRecall: boolean; setFontScale(k: number): void; setLang(l: Lang): void; setTheme(t: ThemePref): void; setModel(id: string): void; setMsgMeta(v: boolean): void; setToolsMemory(v: boolean): void; setToolsDevice(v: boolean): void; setToolsRecall(v: boolean): void }
const savedTheme = read(K.theme)

export const useSettings = create<SettingsState>(set => ({
  lang: detectLang(read(K.lang), getLocales()[0]?.languageCode ?? undefined),
  theme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'auto',
  model: read(K.model),
  fontScale: ((n) => ([0.9, 1, 1.15, 1.3].includes(n) ? n : 1))(Number(read(K.font))),
  /** Names, avatars and times above each message (on by default, like the reference app). */
  msgMeta: read(K.msgMeta) !== '0',
  /** Memory tools write to the memory record that syncs with the web Chat, so they start switched off. */
  toolsMemory: read(K.toolsMem) === '1',
  /** Time, clipboard and calculator: off until the person turns them on, so nothing new reaches a chat by itself. */
  toolsDevice: read(K.toolsDev) === '1',
  /** chat_search sends past conversations to the model provider, so it is a separate opt-in. */
  toolsRecall: read(K.toolsRecall) === '1',
  setFontScale: fontScale => { write(K.font, String(fontScale)); set({ fontScale }) },
  setLang: lang => { write(K.lang, lang); set({ lang }) },
  setTheme: theme => { write(K.theme, theme); set({ theme }) },
  setModel: model => { write(K.model, model); set({ model }) },
  setMsgMeta: msgMeta => { write(K.msgMeta, msgMeta ? '1' : '0'); set({ msgMeta }) },
  setToolsMemory: toolsMemory => { write(K.toolsMem, toolsMemory ? '1' : '0'); set({ toolsMemory }) },
  setToolsDevice: toolsDevice => { write(K.toolsDev, toolsDevice ? '1' : '0'); set({ toolsDevice }) },
  setToolsRecall: toolsRecall => { write(K.toolsRecall, toolsRecall ? '1' : '0'); set({ toolsRecall }) },
}))
