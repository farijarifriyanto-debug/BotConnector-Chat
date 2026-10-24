import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import * as Sharing from 'expo-sharing'
import Storage from 'expo-sqlite/kv-store'
import * as SQLite from 'expo-sqlite'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { BYOK_PROVIDERS } from '../api/search'
import { clearConvs, listConvs, putConv } from '../db/convs'
import type { Conv } from './types'
import {
  ARCHIVE_FORMAT, BACKUP_CATEGORIES, BACKUP_PREF_KEYS, DATABASE_ENTRY, FORMAT_VERSION, IMAGES_ROOT, MANIFEST_ENTRY, SETTINGS_ENTRY,
  buildManifest, checkEntries, readManifest, readSettings, type BackupEntry, type BackupManifest, type BackupSettings,
} from './backup'

const DB_NAME = 'botconnector-chat.db'
const SECURE = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

const bytesFromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
const base64FromBytes = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(out)
}
const readBytes = async (uri: string): Promise<Uint8Array> => bytesFromBase64(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' }))
const writeBytes = async (uri: string, bytes: Uint8Array): Promise<void> => { await FileSystem.writeAsStringAsync(uri, base64FromBytes(bytes), { encoding: 'base64' }) }
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
const dbDir = () => { const d = String(SQLite.defaultDatabaseDirectory ?? ''); return d.endsWith('/') ? d : `${d}/` }
const imagesDir = () => `${FileSystem.documentDirectory ?? ''}images/`
const providerIds = (raw: string | null): string[] => {
  try { const list = JSON.parse(raw ?? '[]'); return Array.isArray(list) ? list.map((p: { id?: unknown }) => (typeof p?.id === 'string' ? p.id : '')).filter(Boolean) : [] } catch { return [] }
}

async function collectSettings(): Promise<BackupSettings> {
  const prefs: Record<string, string> = {}
  for (const key of BACKUP_PREF_KEYS) { try { const v = Storage.getItemSync(key); if (typeof v === 'string') prefs[key] = v } catch { /* unreadable: left out */ } }
  const secrets: Record<string, string> = {}
  for (const id of [...BYOK_PROVIDERS, ...providerIds(prefs['bc.providers.v1'] ?? null)]) {
    for (const key of [`bc.search.key.${id}`, `bc.pk.${id}`]) { try { const v = await SecureStore.getItemAsync(key); if (v) secrets[key] = v } catch { /* none */ } }
  }
  return { prefs, secrets }
}

async function collectImages(): Promise<BackupEntry[]> {
  try {
    const names = await FileSystem.readDirectoryAsync(imagesDir())
    const out: BackupEntry[] = []
    for (const name of names) {
      if (name.includes('/') || name === '.' || name === '..') continue
      try { out.push({ path: `${IMAGES_ROOT}${name}`, bytes: await readBytes(`${imagesDir()}${name}`) }) } catch { /* skip an unreadable picture */ }
    }
    return out
  } catch { return [] }
}

/** A checkpointed copy of the live database plus settings and pictures, zipped with a manifest. */
export async function buildArchive(): Promise<{ manifest: BackupManifest; zip: Uint8Array; name: string }> {
  const db = await SQLite.openDatabaseAsync(DB_NAME)
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);')
  const databaseBytes = await readBytes(`${dbDir()}${DB_NAME}`)
  const settings = await collectSettings()
  const convs = await listConvs()
  const entries: BackupEntry[] = [
    { path: SETTINGS_ENTRY, bytes: strToU8(JSON.stringify(settings)) },
    { path: DATABASE_ENTRY, bytes: databaseBytes },
    ...(await collectImages()),
  ]
  const manifest = buildManifest(entries, {
    createdAtUtc: new Date().toISOString(),
    appVersion: '2.0.0',
    includeChats: true,
    includeFiles: entries.some(e => e.path.startsWith(IMAGES_ROOT)),
    scope: Object.fromEntries(BACKUP_CATEGORIES.map(c => [c, true])) as Record<typeof BACKUP_CATEGORIES[number], boolean>,
    database: { entry: DATABASE_ENTRY, conversationCount: convs.length, messageCount: convs.reduce((n, c) => n + c.messages.length, 0) },
  })
  const files: Record<string, Uint8Array> = { [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest, null, 2)) }
  for (const e of entries) files[e.path] = e.bytes
  return { manifest, zip: zipSync(files, { level: 6 }), name: `botconnector-backup-${stamp()}.zip` }
}

export async function writeArchiveFile(zip: Uint8Array, name: string): Promise<string> {
  const uri = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}${name}`
  await writeBytes(uri, zip)
  return uri
}

export async function shareArchive(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Backup' })
}

export interface PickedArchive { manifest: BackupManifest; settings: BackupSettings; database: Uint8Array; images: BackupEntry[] }

/** Lets the person pick an archive, then validates it exactly as the manifest declares. */
export async function pickArchive(): Promise<PickedArchive | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false })
  const file = picked.canceled ? null : picked.assets[0]
  if (!file) return null
  const zipped = await readBytes(file.uri)
  const files = unzipSync(zipped)
  const manifestBytes = files[MANIFEST_ENTRY]
  if (!manifestBytes) throw new Error('manifest')
  let rawManifest: unknown
  try { rawManifest = JSON.parse(strFromU8(manifestBytes)) } catch { throw new Error('manifest') }
  const manifest = readManifest(rawManifest)
  const entries: BackupEntry[] = Object.entries(files).filter(([p]) => p !== MANIFEST_ENTRY).map(([path, bytes]) => ({ path, bytes }))
  checkEntries(manifest, entries)
  const settingsBytes = files[SETTINGS_ENTRY]
  const settings = readSettings(JSON.parse(strFromU8(settingsBytes)))
  return {
    manifest,
    settings,
    database: files[manifest.database.entry] ?? new Uint8Array(),
    images: entries.filter(e => e.path.startsWith(IMAGES_ROOT)),
  }
}

function convsFromDatabase(bytes: Uint8Array): Promise<Conv[]> {
  return SQLite.deserializeDatabaseAsync(bytes).then(async db => {
    try {
      const rows = await db.getAllAsync<{ doc: string }>('SELECT doc FROM convs ORDER BY updated_at DESC')
      const out: Conv[] = []
      for (const r of rows) { try { const c = JSON.parse(r.doc) as Conv; if (c && typeof c.id === 'string' && Array.isArray(c.messages)) out.push(c) } catch { /* damaged row skipped */ } }
      return out
    } catch { return [] }   // a settings-only archive has no conversation table
    finally { await db.closeAsync().catch(() => {}) }
  })
}

/**
 * Applies an archive: preferences and keys are written (they take effect after a restart, like
 * the reference app), pictures are restored, and the chats are written row by row from the
 * archive's database — overwrite replaces everything, merge adds only ids that are not here.
 */
export async function applyArchive(archive: PickedArchive, mode: 'overwrite' | 'merge'): Promise<{ conversations: number }> {
  for (const [key, value] of Object.entries(archive.settings.prefs)) { try { Storage.setItemSync(key, value) } catch { /* unchanged */ } }
  for (const [key, value] of Object.entries(archive.settings.secrets)) { try { await SecureStore.setItemAsync(key, value, SECURE) } catch { /* unchanged */ } }

  if (archive.images.length) {
    await FileSystem.makeDirectoryAsync(imagesDir(), { intermediates: true }).catch(() => {})
    for (const img of archive.images) await writeBytes(`${imagesDir()}${img.path.slice(IMAGES_ROOT.length)}`, img.bytes).catch(() => {})
  }

  const incoming = archive.database.length ? await convsFromDatabase(archive.database) : []
  if (mode === 'overwrite') {
    await clearConvs()
    for (const c of incoming) await putConv(c)
    return { conversations: incoming.length }
  }
  const ids = new Set((await listConvs()).map(c => c.id))
  const added = incoming.filter(c => !ids.has(c.id))
  for (const c of added) await putConv(c)
  return { conversations: added.length }
}
