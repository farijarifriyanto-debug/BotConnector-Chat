import Storage from 'expo-sqlite/kv-store'
import { getLocales } from 'expo-localization'
import { create } from 'zustand'
import { LANGUAGES } from '../lib/translate'

const K = { target: 'bc.translate.target', prompt: 'bc.translate.prompt', model: 'bc.translate.model', think: 'bc.translate.think' }
const read = (k: string) => { try { return Storage.getItemSync(k) } catch { return null } }
const write = (k: string, v: string) => { try { Storage.setItemSync(k, v) } catch { /* not persisted */ } }
const deviceLanguage = (): string => {
  const code = getLocales()[0]?.languageCode ?? ''
  if (code.startsWith('zh')) return 'zh-CN'
  return LANGUAGES.some(l => l.code === code) ? code : 'en'
}

interface State {
  /** target language of the standalone translate box; the reference app persists it */
  target: string
  /** empty means "use the reference default prompt" */
  prompt: string
  /** null means "use the chat's model" */
  model: string | null
  think: boolean
  setTarget(code: string): void
  setPrompt(prompt: string): void
  setModel(id: string | null): void
  setThink(think: boolean): void
}

const savedTarget = read(K.target)
export const useTranslate = create<State>(set => ({
  target: savedTarget && LANGUAGES.some(l => l.code === savedTarget) ? savedTarget : deviceLanguage(),
  prompt: read(K.prompt) ?? '',
  model: read(K.model) || null,
  think: read(K.think) === '1',
  setTarget: target => { write(K.target, target); set({ target }) },
  setPrompt: prompt => { write(K.prompt, prompt.slice(0, 4000)); set({ prompt: prompt.slice(0, 4000) }) },
  setModel: model => { write(K.model, model ?? ''); set({ model }) },
  setThink: think => { write(K.think, think ? '1' : '0'); set({ think }) },
}))
