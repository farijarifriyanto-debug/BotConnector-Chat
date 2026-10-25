import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { BackupSheet } from '../src/components/BackupSheet'
import { useSettings } from '../src/store/settings'
import Storage from 'expo-sqlite/kv-store'

// Regression test for design-audit finding 008: an EMPTY password on export/upload used to
// show the mismatch copy ("Passwords do not match.") - the wrong message for a missing field.
// It now shows the prompt copy ("Enter backup password"); a genuine mismatch keeps the old copy.

jest.setTimeout(30000)
const mockBuild = jest.fn(async (_opts?: unknown) => ({ manifest: { database: { conversationCount: 0 } }, zip: new Uint8Array([1]), name: 'b.zip', encrypted: false }))
const mockUpload = jest.fn(async (_cfg?: unknown, _name?: unknown, _zip?: unknown) => true)

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
  writeArchiveFile: jest.fn(async () => 'file:///docs/b.zip'),
  shareArchive: jest.fn(async () => {}),
  pickArchive: jest.fn(async () => null),
  applyArchive: jest.fn(async () => ({ conversations: 0 })),
  unpackArchiveBytes: jest.fn(async () => { throw new Error('format') }),
}))
jest.mock('../src/lib/backupRemote', () => ({
  testWebDavConnection: jest.fn(async () => ({ ok: true, status: 207 })),
  uploadWebDavBackup: (cfg: unknown, name: unknown, zip: unknown) => mockUpload(cfg, name, zip),
  listWebDavBackups: jest.fn(async () => []),
  downloadWebDavBackup: jest.fn(async () => new Uint8Array([1, 2, 3])),
}))

const press = (ui: { getByTestId: (id: string) => unknown }, id: string) => {
  void Promise.race([fireEvent.press(ui.getByTestId(id) as never), new Promise<void>(res => setTimeout(res, 3000))])
}

beforeEach(() => {
  jest.clearAllMocks()
  useSettings.setState({ lang: 'en' })
  Storage.setItemSync('bc.webdav.cfg', '')
})

describe('backup password error copy distinguishes empty from mismatch (finding 008)', () => {
  it('export with encryption on and no password asks for one', async () => {
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent(r.getByTestId('backup-encrypt-toggle'), 'valueChange', true)
    press(r, 'backup-export')
    await waitFor(() => expect(r.getByText('Enter backup password')).toBeTruthy())
    expect(mockBuild).not.toHaveBeenCalled()
  })

  it('upload to remote with encryption on and no password asks for one', async () => {
    Storage.setItemSync('bc.webdav.cfg', JSON.stringify({ url: 'https://dav.test/dav', username: 'u', path: '' }))
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent(r.getByTestId('backup-encrypt-toggle'), 'valueChange', true)
    await fireEvent.press(r.getByTestId('backup-tab-remote'))
    press(r, 'webdav-upload-btn')
    await waitFor(() => expect(r.getByText('Enter backup password')).toBeTruthy())
    expect(mockBuild).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('export with two different passwords still reports the mismatch', async () => {
    const r = await render(<BackupSheet visible onClose={() => {}} />)
    await fireEvent(r.getByTestId('backup-encrypt-toggle'), 'valueChange', true)
    await fireEvent.changeText(r.getByTestId('backup-password-input'), 'secret123')
    await fireEvent.changeText(r.getByTestId('backup-password-confirm'), 'different')
    press(r, 'backup-export')
    await waitFor(() => expect(r.getByText('Passwords do not match.')).toBeTruthy())
    expect(mockBuild).not.toHaveBeenCalled()
  })
})
