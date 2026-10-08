import type { Lang } from '../i18n/langs'

const SITE = 'https://botconnector.id'
export type LegalPage = 'privacy' | 'terms' | 'support'
/** Pages on botconnector.id. Only Indonesian and English exist; every other app language reads the English page. The help page has one address for both. */
export const legalUrl = (page: LegalPage, lang: Lang): string => `${SITE}${lang === 'id' && page !== 'support' ? '/id' : ''}/${page}`
