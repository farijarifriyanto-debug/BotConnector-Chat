import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { BackupError } from '../src/lib/backup'
import { BackupSheet } from '../src/components/BackupSheet'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
const mockBuild = jest.fn(async (_opts?: unknown) => ({
  manifest: { database: { conversationCount: 1 } },
  zip: new Uint8Array([1]),
  name: 'botconnector-backup-1.zip',
  encrypted: false,
}) as unknown)
const mockWrite = jest.fn(async (_zip: Uint8Array, _name: string) => 'file:///docs/b.zip')
const mockShare = jest.fn(async (_uri: string) => {})
const mockPick = jest.fn(async (_opts?: unknown) => null as unknown)
const mockApply = jest.fn(async (_a: unknown, _m: string) => ({ conversations: 2 }))

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 1,
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({
  listConvs: async () => [],
  putConv: async () => {},
  deleteConv: async () => {},
  clearConvs: async () => {},
  getConv: async () => null,
}))
jest.mock('../src/lib/backupDevice', () => ({
  buildArchive: (opts?: unknown) => mockBuild(opts),
  writeArchiveFile: (zip: Uint8Array, name: string) => mockWrite(zip, name),
  shareArchive: (uri: string) => mockShare(uri),
  pickArchive: (opts?: unknown) => mockPick(opts),
  applyArchive: (a: unknown, m: string) => mockApply(a, m),
  unpackArchiveBytes: jest.fn(),
}))

const mockTestWebDav = jest.fn(async (_cfg?: unknown) => ({ ok: true, status: 207 }))
const mockUploadWebDav = jest.fn(async (_cfg?: unknown, _name?: string, _bytes?: Uint8Array) => true)
const mockListWebDav = jest.fn(async (_cfg?: unknown) => [
  { name: 'backup-remote-1.kbackup', size: 2048, lastModified: 'today', url: 'https://dav.test/b1.kbackup' },
])
const mockDownloadWebDav = jest.fn(async (_cfg?: unknown, _name?: string) => new Uint8Array([1, 2, 3]))

jest.mock('../src/lib/backupRemote', () => ({
  testWebDavConnection: (_cfg: unknown) => mockTestWebDav(_cfg),
  uploadWebDavBackup: (_cfg: unknown, _name: string, _bytes: Uint8Array) => mockUploadWebDav(_cfg, _name, _bytes),
  listWebDavBackups: (_cfg: unknown) => mockListWebDav(_cfg),
  downloadWebDavBackup: (_cfg: unknown, _name: string) => mockDownloadWebDav(_cfg, _name),
}))

const archive = {
  manifest: { database: { conversationCount: 2 } },
  settings: { prefs: {}, secrets: {} },
  database: new Uint8Array([1]),
  images: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  useSettings.setState({ lang: 'en' })
})

describe('backup sheet', () => {
  it('exports the archive and shares it', async () => {
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('backup-export'))
    await waitFor(() => expect(mockWrite).toHaveBeenCalledWith(new Uint8Array([1]), 'botconnector-backup-1.zip'))
    expect(mockShare).toHaveBeenCalledWith('file:///docs/b.zip')
    expect(r.getByTestId('backup-note')).toBeTruthy()
  })

  it('supports password encryption for export', async () => {
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    const toggle = r.getByTestId('backup-encrypt-toggle')
    await fireEvent(toggle, 'valueChange', true)

    // Password mismatch shows error
    await fireEvent.changeText(r.getByTestId('backup-password-input'), 'secret123')
    await fireEvent.changeText(r.getByTestId('backup-password-confirm'), 'different')
    await fireEvent.press(r.getByTestId('backup-export'))
    await waitFor(() => expect(r.getByTestId('backup-error')).toBeTruthy())

    // Matching password triggers encrypted build
    await fireEvent.changeText(r.getByTestId('backup-password-confirm'), 'secret123')
    await fireEvent.press(r.getByTestId('backup-export'))
    await waitFor(() =>
      expect(mockBuild).toHaveBeenCalledWith({ password: 'secret123' })
    )
  })

  it('imports, offers overwrite or merge, writes a safety archive, and asks for a restart', async () => {
    mockPick.mockResolvedValue(archive)
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('backup-import'))
    await waitFor(() => expect(r.getByTestId('backup-mode')).toBeTruthy())
    await fireEvent.press(r.getByTestId('backup-overwrite'))
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith(archive, 'overwrite'))
    expect(mockWrite).toHaveBeenCalledWith(new Uint8Array([1]), 'botconnector-before-restore-1.zip')
    await waitFor(() => expect(r.getByTestId('backup-restart')).toBeTruthy())
  })

  it('can merge instead', async () => {
    mockPick.mockResolvedValue(archive)
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('backup-import'))
    await waitFor(() => expect(r.getByTestId('backup-mode')).toBeTruthy())
    await fireEvent.press(r.getByTestId('backup-merge'))
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith(archive, 'merge'))
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('says so when the file is not ours', async () => {
    mockPick.mockRejectedValue(new BackupError('format'))
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('backup-import'))
    await waitFor(() => expect(r.getByTestId('backup-error')).toBeTruthy())
  })

  it('switches to remote WebDAV tab and tests connection', async () => {
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('backup-tab-remote'))

    await fireEvent.changeText(r.getByTestId('webdav-url-input'), 'https://dav.test')
    await fireEvent.changeText(r.getByTestId('webdav-user-input'), 'user')
    await fireEvent.changeText(r.getByTestId('webdav-pass-input'), 'pass')

    await fireEvent.press(r.getByTestId('webdav-test-btn'))
    await waitFor(() => expect(mockTestWebDav).toHaveBeenCalled())
    expect(r.getByTestId('backup-note')).toBeTruthy()

    await fireEvent.press(r.getByTestId('webdav-upload-btn'))
    await waitFor(() => expect(mockUploadWebDav).toHaveBeenCalled())
  })
})
