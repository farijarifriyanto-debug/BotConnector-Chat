import './helpers/mocks'
import { unzipSync, strFromU8 } from 'fflate'
import { BACKUP_CATEGORIES, BackupError, DATABASE_ENTRY, MANIFEST_ENTRY, SETTINGS_ENTRY, buildManifest, checkEntries, readManifest, readSettings, sha256Hex } from '../src/lib/backup'
import { applyArchive, buildArchive, pickArchive } from '../src/lib/backupDevice'
import { newConv } from '../src/lib/conv'

jest.setTimeout(30000)
const mockList = jest.fn(async () => [] as unknown[]), mockPut = jest.fn(async (_c: unknown) => {}), mockClear = jest.fn(async () => {})
const mockRead = jest.fn(async (_uri: string) => ''), mockWriteFile = jest.fn(async (_uri: string, _b64: string, _o?: unknown) => {})
const mockDir = jest.fn(async (_d: string) => [] as string[]), mockMakeDir = jest.fn(async (_d: string, _o?: unknown) => {})
const mockDocs = jest.fn(async (_sql: string) => [] as unknown[])
const mockPickDoc = jest.fn(async (_o?: unknown) => ({ canceled: true, assets: [] }) as unknown)
const mockDeserialized = jest.fn(async (_b: Uint8Array) => ({ getAllAsync: (sql: string) => mockDocs(sql), closeAsync: async () => {} }))

jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: async () => 'sk-secret', setItemAsync: jest.fn(async () => {}), deleteItemAsync: async () => {} }))
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({ execAsync: jest.fn(async () => {}) })),
  defaultDatabaseDirectory: 'file:///db/',
  deserializeDatabaseAsync: (b: Uint8Array) => mockDeserialized(b),
}))
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  readAsStringAsync: (uri: string) => mockRead(uri), writeAsStringAsync: (uri: string, b64: string, o?: unknown) => mockWriteFile(uri, b64, o),
  readDirectoryAsync: (d: string) => mockDir(d), makeDirectoryAsync: (d: string, o?: unknown) => mockMakeDir(d, o),
}))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (o?: unknown) => mockPickDoc(o) }))
jest.mock('../src/db/convs', () => ({ listConvs: () => mockList(), putConv: (c: unknown) => mockPut(c), deleteConv: async () => {}, clearConvs: () => mockClear(), getConv: async () => null }))

const chat = (id: string, title = 't') => ({ ...newConv('m'), id, title })
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const settings = { prefs: { 'bc.lang': 'id' }, secrets: { 'bc.pk.x': 'k' } }
const meta = { createdAtUtc: '2026-10-24T00:00:00.000Z', appVersion: '2.0.0', includeChats: true, includeFiles: true, scope: Object.fromEntries(BACKUP_CATEGORIES.map(c => [c, true])) as never, database: { entry: DATABASE_ENTRY, conversationCount: 1, messageCount: 2 } }

beforeEach(() => {
  jest.clearAllMocks()
  mockList.mockResolvedValue([chat('a')])
  mockRead.mockImplementation(async (uri: string) => b64(new Uint8Array(uri.includes('images') ? [1, 2, 3] : [65, 66, 67])))
  mockDir.mockResolvedValue(['p.png'])
  mockDocs.mockResolvedValue([{ doc: JSON.stringify(chat('a')) }, { doc: JSON.stringify(chat('b')) }])
  require('expo-sqlite/kv-store').default.setItemSync('bc.lang', 'id')
})

describe('manifest and checksums', () => {
  it('declares every entry with its size and hash, and verifies them on the way back', () => {
    const entries = [{ path: SETTINGS_ENTRY, bytes: new Uint8Array([1, 2]) }, { path: DATABASE_ENTRY, bytes: new Uint8Array([3]) }]
    const manifest = buildManifest(entries, meta)
    expect(manifest.entries[SETTINGS_ENTRY]).toEqual({ bytes: 2, sha256: sha256Hex(new Uint8Array([1, 2])) })
    expect(readManifest(JSON.parse(JSON.stringify(manifest)))).toMatchObject({ format: 'botconnector-backup', formatVersion: 1, payloadKind: 'sqlite' })
    expect(() => checkEntries(manifest, entries)).not.toThrow()
    expect(() => checkEntries(manifest, [{ path: SETTINGS_ENTRY, bytes: new Uint8Array([1, 2]) }])).toThrow(BackupError)
    expect(() => checkEntries(manifest, [{ path: SETTINGS_ENTRY, bytes: new Uint8Array([9, 9]) }, entries[1]])).toThrow(BackupError)
    expect(() => readManifest({ format: 'kelivo-backup' })).toThrow(BackupError)
    expect(() => readManifest({ ...manifest, formatVersion: 99 })).toThrow(BackupError)
    expect(readSettings({ prefs: { a: 'b' } })).toEqual({ prefs: { a: 'b' }, secrets: {} })
  })
})

describe('the zip archive', () => {
  it('holds the manifest, the settings and the database file with matching hashes', async () => {
    const { zip, manifest, name } = await buildArchive()
    expect(name).toMatch(/^botconnector-backup-\d{8}-\d{6}\.zip$/)
    const files = unzipSync(zip)
    expect(JSON.parse(strFromU8(files[MANIFEST_ENTRY]))).toMatchObject({ format: 'botconnector-backup' })
    expect(JSON.parse(strFromU8(files[SETTINGS_ENTRY])).prefs).toEqual({ 'bc.lang': 'id' })
    expect(JSON.parse(strFromU8(files[SETTINGS_ENTRY])).secrets['bc.pk.brave']).toBe('sk-secret')
    expect(Array.from(files[DATABASE_ENTRY])).toEqual([65, 66, 67])   // the database file, not a JSON dump
    expect(files['images/p.png']).toBeTruthy()
    const entries = Object.entries(files).filter(([p]) => p !== MANIFEST_ENTRY).map(([path, bytes]) => ({ path, bytes }))
    expect(() => checkEntries(manifest, entries)).not.toThrow()
    expect(manifest.database).toMatchObject({ entry: DATABASE_ENTRY, conversationCount: 1 })
  })

  it('reads a picked archive only after verifying it, then overwrites or merges', async () => {
    const { zip } = await buildArchive()
    mockPickDoc.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.zip' }] })
    mockRead.mockImplementation(async (uri: string) => (uri === 'file:///picked.zip' ? b64(zip) : b64(new Uint8Array([65]))))
    const picked = await pickArchive()
    expect(picked?.manifest.entries[SETTINGS_ENTRY]).toBeTruthy()

    await applyArchive(picked!, 'overwrite')
    expect(mockClear).toHaveBeenCalled()
    expect(mockPut).toHaveBeenCalledTimes(2)
    expect(require('expo-secure-store').setItemAsync).toHaveBeenCalledWith('bc.pk.brave', 'sk-secret', expect.anything())
    expect(mockWriteFile).toHaveBeenCalled()   // the picture

    mockList.mockResolvedValue([chat('a')])
    const merged = await applyArchive(picked!, 'merge')
    expect(merged).toEqual({ conversations: 1 })
    expect(mockPut.mock.calls.at(-1)![0]).toMatchObject({ id: 'b' })
  })

  it('refuses a tampered archive', async () => {
    const { zip } = await buildArchive()
    const files = unzipSync(zip)
    files[SETTINGS_ENTRY] = new Uint8Array([9])
    const tampered = require('fflate').zipSync(files)
    mockPickDoc.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///bad.zip' }] })
    mockRead.mockResolvedValue(b64(tampered))
    await expect(pickArchive()).rejects.toThrow(BackupError)
  })
})
