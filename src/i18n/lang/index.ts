import type { Lang } from '../langs'
import de from './de'
import es from './es'
import fr from './fr'
import hi from './hi'
import it from './it'
import ja from './ja'
import ko from './ko'
import ms from './ms'
import nl from './nl'
import pt from './pt'
import ru from './ru'
import th from './th'
import tr from './tr'
import vi from './vi'
import zh from './zh'

/** Translations for the screens the app shows. A key missing from a pack falls back to English. */
export const PACKS: Partial<Record<Lang, Record<string, string>>> = { de, es, fr, hi, it, ja, ko, ms, nl, pt, ru, th, tr, vi, zh }
