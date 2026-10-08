import { LANGUAGES, detectLang } from '../src/i18n/langs'
import { STRINGS, t } from '../src/i18n/strings'

const en = STRINGS.en as Record<string, string>
const placeholders = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join(',')

describe('language packs', () => {
  it('every offered language has a pack (or is built in)', () => {
    for (const l of LANGUAGES) expect(l.code === 'en' || !!STRINGS[l.code]).toBe(true)
  })
  for (const l of LANGUAGES.filter(x => x.code !== 'en')) {
    const pack = STRINGS[l.code] as Record<string, string>
    it(`${l.code}: only known keys, no empty text, placeholders match English`, () => {
      const unknown = Object.keys(pack).filter(k => !(k in en)); expect(unknown).toEqual([])
      const empty = Object.entries(pack).filter(([, v]) => !String(v).trim()).map(([k]) => k); expect(empty).toEqual([])
      const bad = Object.keys(pack).filter(k => k in en && placeholders(pack[k]) !== placeholders(en[k])); expect(bad).toEqual([])
    })
    if (l.code !== 'id') it(`${l.code}: covers the screens the app uses`, () => {
      const used = ['newChat', 'send', 'settings', 'web', 'researchPill', 'imgPill', 'errNetwork', 'loginTitle', 'fgWebBody', 'provAdd', 'locTitle', 'dAcctWarning', 'syncTitle', 'fsTitle', 'language']
      expect(used.filter(k => !pack[k])).toEqual([])
    })
  }
  it('falls back to English for a key a pack lacks, and detects the phone language', () => {
    expect(t('de', 'newChat')).toBe('Neuer Chat'); expect(t('en', 'newChat')).toBe('New chat')
    const lacking = Object.keys(en).find(k => !(STRINGS.th as Record<string, string>)[k]); if (lacking) expect(t('th', lacking as never)).toBe(en[lacking])
    expect(detectLang(null, 'ja')).toBe('ja'); expect(detectLang(null, 'xx')).toBe('en'); expect(detectLang('ko', 'id')).toBe('ko'); expect(detectLang('zz', 'es')).toBe('es')
  })
})
