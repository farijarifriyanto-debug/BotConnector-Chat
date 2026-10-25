import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { BackupError } from '../src/lib/backup'
import { BackupSheet } from '../src/components/BackupSheet'
import { useSettings } from '../src/store/settings'
import Storage from 'expo-sqlite/kv-store'

// Regression test for design-audit finding 001: cancelling the password prompt used to
// leave the awaited getPassword promise forever pending, freezing the sheet in its busy
// state. The dispatch of the first press is deliberately NOT awaited: under React 19's
// act integration a press that starts a still-pending getPassword promise never settles,
// which is the exact freeze this sheet used to inflict on the user.

jest.setTimeout(30000)
const mockBuild = jest.fn(async (_opts?: unknown) => ({ manifest: { database: { conversationCount: 0 } }, zip: new Uint8Array([1]), name: 'b.zip', encrypted: false }))
const mockWrite = jest.fn(async (_zip?: unknown, _name?: unknown) => 'file:///docs/b.zip')
const mockShare = jest.fn(async (_uri?: unknown) => {})
const mockPick = jest.fn(async (_opts?: unknown) => null)
const mockApply = jest.fn(async (_a?: unknown, _m?: unknown) => ({ conversations: 0 }))
const mockUnpack = jest.fn(async (_bytes?: unknown, _opts?: unknown) => { throw new BackupError('cancel') })

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 1,
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: async () => {}, deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/lib/backupDevice', () => ({
  buildArchive: (opts?: unknown) => mockBuild(opts),
  writeArchiveFile: (zip: unknown, name: unknown) => mockWrite(zip, name),
  shareArchive: (uri: unknown) => mockShare(uri),
  pickArchive: (opts?: unknown) => mockPick(opts),
  applyArchive: (a: unknown, m: unknown) => mockApply(a, m),
  unpackArchiveBytes: (bytes: unknown, opts?: unknown) => mockUnpack(bytes, opts),
}))
jest.mock('../src/lib/backupRemote', () => ({
  testWebDavConnection: jest.fn(async () => ({ ok: true, status: 207 })),
  uploadWebDavBackup: jest.fn(async () => true),
  listWebDavBackups: jest.fn(async () => [{ name: 'b.kbackup', size: 2048, lastModified: 'today', url: 'https://dav.test/b.kbackup' }]),
  downloadWebDavBackup: jest.fn(async () => new Uint8Array([1, 2, 3])),
}))

// Press and let the pending-password deadlock resolve itself: the returned dispatch is
// bounded so a never-settling press cannot stall the test while its state changes land.
const press = (ui: { getByTestId: (id: string) => { props: Record<string, unknown> } }, id: string) => {
  void Promise.race([fireEvent.press(ui.getByTestId(id) as never), new Promise<void>(res => setTimeout(res, 3000))])
}

beforeEach(() => {
  jest.clearAllMocks()
  useSettings.setState({ lang: 'en' })
})

describe('backup password prompt cancel (regression for the frozen busy state)', () => {
  it('resolves the awaited getPassword promise with null and clears busy after cancelling an import', async () => {
    let sentPassword: string | null | undefined
    mockPick.mockImplementationOnce(async (opts?: unknown) => {
      sentPassword = await (opts as { getPassword: () => Promise<string | null> }).getPassword()
      return null
    })
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    press(r, 'backup-import')
    await waitFor(() => expect(r.getByTestId('backup-password-prompt')).toBeTruthy())
    expect(r.getByTestId('backup-busy')).toBeTruthy()
    await fireEvent.press(r.getByTestId('import-password-cancel'))
    expect(sentPassword).toBeNull()
    await waitFor(() => expect(r.queryByTestId('backup-password-prompt')).toBeNull())
    await waitFor(() => expect(r.queryByTestId('backup-busy')).toBeNull())
    expect(r.queryByTestId('backup-error')).toBeNull()
  })

  it('resolves and clears busy after cancelling the remote restore password prompt', async () => {
    let sentPassword: string | null | undefined
    mockUnpack.mockImplementationOnce(async (_bytes?: unknown, opts?: unknown) => {
      sentPassword = await (opts as { getPassword: () => Promise<string | null> }).getPassword()
      throw new BackupError('cancel')
    })
    Storage.setItemSync('bc.webdav.cfg', JSON.stringify({ url: 'https://dav.test/dav', username: 'u', path: '' }))
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('backup-tab-remote'))
    await waitFor(() => expect(r.getByTestId('restore-remote-b.kbackup')).toBeTruthy())
    press(r, 'restore-remote-b.kbackup')
    await waitFor(() => expect(r.getByTestId('backup-password-prompt')).toBeTruthy())
    expect(r.getByTestId('backup-busy')).toBeTruthy()
    await fireEvent.press(r.getByTestId('import-password-cancel'))
    expect(sentPassword).toBeNull()
    await waitFor(() => expect(r.queryByTestId('backup-password-prompt')).toBeNull())
    await waitFor(() => expect(r.queryByTestId('backup-busy')).toBeNull())
    expect(r.queryByTestId('backup-error')).toBeNull()
  })
})
