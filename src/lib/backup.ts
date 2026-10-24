import { sha256 } from 'js-sha256'

/**
 * The archive follows the reference app's backup design: one ZIP with a manifest, a settings
 * document, the SQLite database and the file roots, every declared entry carrying its size
 * and sha256. Only the ids differ (this app's own database, categories and format name).
 */
export const ARCHIVE_FORMAT = 'botconnector-backup'
export const FORMAT_VERSION = 1
export const MIN_READABLE_FORMAT_VERSION = 1
export const MANIFEST_ENTRY = 'manifest.json'
export const SETTINGS_ENTRY = 'settings.json'
export const DATABASE_ENTRY = 'database/botconnector-chat.db'
export const IMAGES_ROOT = 'images/'

export type BackupCategory = 'chats' | 'files' | 'settings' | 'providers' | 'assistants' | 'worldBooks' | 'instructions' | 'quickPhrases'
export const BACKUP_CATEGORIES: BackupCategory[] = ['chats', 'files', 'settings', 'providers', 'assistants', 'worldBooks', 'instructions', 'quickPhrases']

/** Stored preferences that make the app feel the same after a restore. */
export const BACKUP_PREF_KEYS = [
  'bc.lang', 'bc.theme', 'bc.model', 'bc.font', 'bc.msgMeta', 'bc.toolsMem', 'bc.toolsDev', 'bc.toolsRecall', 'bc.think',
  'bc.search.provider', 'bc.search.count', 'bc.webFetch',
  'bc.phrases.v1', 'bc.wb.v1', 'bc.tools.v1', 'bc.instr.v1', 'bc.pals.v1', 'bc.providers.v1', 'bc.video.v1',
]

export interface BackupEntry { path: string; bytes: Uint8Array }
export interface BackupSettings { prefs: Record<string, string>; secrets: Record<string, string> }

export interface BackupManifest {
  format: string
  formatVersion: number
  minimumReadableFormatVersion: number
  payloadKind: 'sqlite'
  createdAtUtc: string
  appVersion: string
  includeChats: boolean
  includeFiles: boolean
  /** provider and search keys travel inside settings.json, like the reference app */
  secretsIncluded: true
  scope: Record<BackupCategory, boolean>
  database: { entry: string; conversationCount: number; messageCount: number }
  entries: Record<string, { bytes: number; sha256: string }>
}

export class BackupError extends Error {
  code: 'format' | 'version' | 'manifest' | 'entry' | 'hash' | 'size' | 'settings' | 'database'
  constructor(code: BackupError['code']) { super(code); this.code = code; Object.setPrototypeOf(this, new.target.prototype) }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export const sha256Hex = (bytes: Uint8Array): string => sha256(bytes)

export function buildManifest(entries: BackupEntry[], meta: {
  createdAtUtc: string
  appVersion: string
  includeChats: boolean
  includeFiles: boolean
  scope: Record<BackupCategory, boolean>
  database: { entry: string; conversationCount: number; messageCount: number }
}): BackupManifest {
  const declared: BackupManifest['entries'] = {}
  for (const e of entries) declared[e.path] = { bytes: e.bytes.length, sha256: sha256Hex(e.bytes) }
  return {
    format: ARCHIVE_FORMAT,
    formatVersion: FORMAT_VERSION,
    minimumReadableFormatVersion: MIN_READABLE_FORMAT_VERSION,
    payloadKind: 'sqlite',
    createdAtUtc: meta.createdAtUtc,
    appVersion: meta.appVersion,
    includeChats: meta.includeChats,
    includeFiles: meta.includeFiles,
    secretsIncluded: true,
    scope: meta.scope,
    database: meta.database,
    entries: declared,
  }
}

/** Reads a manifest; another app's archive or a newer format is refused. */
export function readManifest(raw: unknown): BackupManifest {
  if (!isObject(raw) || raw.format !== ARCHIVE_FORMAT) throw new BackupError('format')
  if (typeof raw.formatVersion !== 'number' || raw.formatVersion > FORMAT_VERSION || raw.formatVersion < MIN_READABLE_FORMAT_VERSION) throw new BackupError('version')
  if (raw.payloadKind !== 'sqlite' || !isObject(raw.entries) || !isObject(raw.database)) throw new BackupError('manifest')
  const entries: BackupManifest['entries'] = {}
  for (const [path, v] of Object.entries(raw.entries)) {
    if (!isObject(v) || typeof v.bytes !== 'number' || typeof v.sha256 !== 'string') throw new BackupError('manifest')
    entries[path] = { bytes: v.bytes, sha256: v.sha256 }
  }
  return {
    format: ARCHIVE_FORMAT,
    formatVersion: raw.formatVersion,
    minimumReadableFormatVersion: typeof raw.minimumReadableFormatVersion === 'number' ? raw.minimumReadableFormatVersion : MIN_READABLE_FORMAT_VERSION,
    payloadKind: 'sqlite',
    createdAtUtc: typeof raw.createdAtUtc === 'string' ? raw.createdAtUtc : '',
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    includeChats: raw.includeChats === true,
    includeFiles: raw.includeFiles === true,
    secretsIncluded: true,
    scope: Object.fromEntries(BACKUP_CATEGORIES.map(c => [c, isObject(raw.scope) ? raw.scope[c] === true : false])) as Record<BackupCategory, boolean>,
    database: { entry: String((raw.database as Record<string, unknown>).entry ?? DATABASE_ENTRY), conversationCount: Number((raw.database as Record<string, unknown>).conversationCount ?? 0), messageCount: Number((raw.database as Record<string, unknown>).messageCount ?? 0) },
    entries,
  }
}

/** Every declared entry must be present with the declared size and hash; extra entries are ignored (forward compatible). */
export function checkEntries(manifest: BackupManifest, entries: BackupEntry[]): void {
  const byPath = new Map(entries.map(e => [e.path, e.bytes]))
  for (const [path, declared] of Object.entries(manifest.entries)) {
    const bytes = byPath.get(path)
    if (!bytes) throw new BackupError('entry')
    if (bytes.length !== declared.bytes) throw new BackupError('size')
    if (sha256Hex(bytes) !== declared.sha256) throw new BackupError('hash')
  }
  if (!manifest.entries[SETTINGS_ENTRY]) throw new BackupError('settings')
  if (manifest.includeChats && !manifest.entries[manifest.database.entry]) throw new BackupError('database')
}

export function readSettings(raw: unknown): BackupSettings {
  if (!isObject(raw)) throw new BackupError('settings')
  const strings = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {}
    if (isObject(v)) for (const [k, val] of Object.entries(v)) if (typeof val === 'string' && k.length <= 200 && val.length <= 2_000_000) out[k] = val
    return out
  }
  return { prefs: strings(raw.prefs), secrets: strings(raw.secrets) }
}
