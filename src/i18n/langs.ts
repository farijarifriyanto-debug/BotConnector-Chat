// Languages the app can show. Each pack may be partial: anything not translated falls back to English.
export const LANGUAGES = [
  { code: 'en', name: 'English', bcp47: 'en-US', comma: false },
  { code: 'id', name: 'Bahasa Indonesia', bcp47: 'id-ID', comma: true },
  { code: 'ms', name: 'Bahasa Melayu', bcp47: 'ms-MY', comma: false },
  { code: 'es', name: 'Español', bcp47: 'es-ES', comma: true },
  { code: 'fr', name: 'Français', bcp47: 'fr-FR', comma: true },
  { code: 'de', name: 'Deutsch', bcp47: 'de-DE', comma: true },
  { code: 'pt', name: 'Português', bcp47: 'pt-BR', comma: true },
  { code: 'it', name: 'Italiano', bcp47: 'it-IT', comma: true },
  { code: 'nl', name: 'Nederlands', bcp47: 'nl-NL', comma: true },
  { code: 'ru', name: 'Русский', bcp47: 'ru-RU', comma: true },
  { code: 'tr', name: 'Türkçe', bcp47: 'tr-TR', comma: true },
  { code: 'vi', name: 'Tiếng Việt', bcp47: 'vi-VN', comma: true },
  { code: 'th', name: 'ไทย', bcp47: 'th-TH', comma: false },
  { code: 'hi', name: 'हिन्दी', bcp47: 'hi-IN', comma: false },
  { code: 'zh', name: '简体中文', bcp47: 'zh-CN', comma: false },
  { code: 'ja', name: '日本語', bcp47: 'ja-JP', comma: false },
  { code: 'ko', name: '한국어', bcp47: 'ko-KR', comma: false },
] as const
export type Lang = (typeof LANGUAGES)[number]['code']
export const LANG_CODES: readonly string[] = LANGUAGES.map(l => l.code)
const byCode = (c: string) => LANGUAGES.find(l => l.code === c)
export const bcp47 = (lang: string) => byCode(lang)?.bcp47 ?? 'en-US'
/** How numbers in tables are written: "1.234,5" (id style) or "1,234.5" (en style). */
export const numStyle = (lang: string): 'id' | 'en' => (byCode(lang)?.comma ? 'id' : 'en')
export const langName = (lang: string) => byCode(lang)?.name ?? lang
/** Stored choice first, then the phone's language, then English. */
export const detectLang = (stored: string | null, nav: string | undefined): Lang => {
  if (stored && LANG_CODES.includes(stored)) return stored as Lang
  const c = (nav || '').toLowerCase().slice(0, 2)
  return (LANG_CODES.includes(c) ? c : 'en') as Lang
}
