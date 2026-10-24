import {
  testWebDavConnection,
  uploadWebDavBackup,
  listWebDavBackups,
  downloadWebDavBackup,
  type WebDavConfig,
} from '../src/lib/backupRemote'

const mockConfig: WebDavConfig = {
  url: 'https://dav.example.com',
  username: 'testuser',
  password: 'testpassword',
  path: '/backups',
}

describe('WebDAV remote backup (Kelivo parity)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('tests connection via PROPFIND with credentials', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 207,
      text: async () => '<D:multistatus xmlns:D="DAV:"></D:multistatus>',
    })) as unknown as typeof fetch

    const result = await testWebDavConnection(mockConfig)
    expect(result.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://dav.example.com/backups',
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          Depth: '0',
        }),
      })
    )
  })

  it('uploads backup archive with PUT request', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
    })) as unknown as typeof fetch

    const bytes = new Uint8Array([1, 2, 3, 4])
    const res = await uploadWebDavBackup(mockConfig, 'backup-1.kbackup', bytes)
    expect(res).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://dav.example.com/backups/backup-1.kbackup',
      expect.objectContaining({
        method: 'PUT',
        body: bytes,
      })
    )
  })

  it('lists remote backup files from PROPFIND XML', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/backups/</D:href>
    <D:propstat>
      <D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/backups/botconnector-backup-20261024-120000.kbackup</D:href>
    <D:propstat>
      <D:prop>
        <D:getcontentlength>1048576</D:getcontentlength>
        <D:getlastmodified>Sat, 24 Oct 2026 12:00:00 GMT</D:getlastmodified>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 207,
      text: async () => xml,
    })) as unknown as typeof fetch

    const items = await listWebDavBackups(mockConfig)
    expect(items.length).toBe(1)
    expect(items[0]).toEqual({
      name: 'botconnector-backup-20261024-120000.kbackup',
      size: 1048576,
      lastModified: 'Sat, 24 Oct 2026 12:00:00 GMT',
      url: 'https://dav.example.com/backups/botconnector-backup-20261024-120000.kbackup',
    })
  })

  it('downloads remote backup file', async () => {
    const mockBytes = new Uint8Array([65, 66, 67])
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => mockBytes.buffer,
    })) as unknown as typeof fetch

    const downloaded = await downloadWebDavBackup(mockConfig, 'botconnector-backup-20261024-120000.kbackup')
    expect(downloaded).toEqual(mockBytes)
  })
})
