import * as FileSystem from 'expo-file-system/legacy'
import { useEffect } from 'react'
import { create } from 'zustand'
import { useSettings } from '../store/settings'
import { useAuth } from '../store/auth'

/** Only the screenshot build (EXPO_PUBLIC_SCREENSHOT=1, set by the "App Store screenshots" workflow) looks for these instructions. Store builds never do. */
export const SHOT = process.env.EXPO_PUBLIC_SCREENSHOT === '1'
export const useShot = create<{ scene: string }>(() => ({ scene: 'login' }))

/** CI writes "<counter>:<scene>" into Documents/shot.txt of the simulator's app container (no dialogs, unlike opening a link). Scenes: lang-id, lang-en, dark, guest, home, local, providers, settings. */
export function useShotLinks() {
  useEffect(() => {
    if (!SHOT) return
    let last = ''
    const run = (s: string) => {
      if (s === 'lang-id' || s === 'lang-en') useSettings.getState().setLang(s === 'lang-id' ? 'id' : 'en')
      else if (s === 'dark') useSettings.getState().setTheme('dark')
      else { if (s === 'guest') useAuth.getState().continueAsGuest(); useShot.setState({ scene: s }) }
    }
    const file = (FileSystem.documentDirectory ?? '') + 'shot.txt'
    const timer = setInterval(async () => {
      try {
        if (!(await FileSystem.getInfoAsync(file)).exists) return
        const txt = (await FileSystem.readAsStringAsync(file)).trim()
        if (txt && txt !== last) { last = txt; run(txt.split(':')[1] ?? '') }
      } catch { /* try again on the next tick */ }
    }, 400)
    return () => clearInterval(timer)
  }, [])
}
