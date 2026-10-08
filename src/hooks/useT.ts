import { useCallback } from 'react'
import { t, type Key } from '../i18n/strings'
import { useSettings } from '../store/settings'

/** Translator bound to the language chosen in Settings. */
export function useT() {
  const lang = useSettings(s => s.lang)
  return useCallback((key: Key, vars?: Record<string, string | number>) => t(lang, key, vars), [lang])
}
