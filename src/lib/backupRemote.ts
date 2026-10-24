/**
 * Remote backup provider for WebDAV and Cloud sync (Kelivo parity).
 */

export interface WebDavConfig {
  url: string
  username?: string
  password?: string
  path?: string
}

export interface RemoteBackupItem {
  name: string
  size: number
  lastModified: string
  url: string
}

function cleanPath(url: string, path?: string): string {
  let base = url.trim().replace(/\/+$/, '')
  if (!path) return base
  const sub = path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return sub ? `${base}/${sub}` : base
}

function authHeader(cfg: WebDavConfig): Record<string, string> {
  if (cfg.username || cfg.password) {
    const raw = `${cfg.username || ''}:${cfg.password || ''}`
    let b64 = ''
    if (typeof btoa !== 'undefined') {
      b64 = btoa(raw)
    } else {
      const bytes = new TextEncoder().encode(raw)
      for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      b64 = btoa(b64)
    }
    return { Authorization: `Basic ${b64}` }
  }
  return {}
}

export async function testWebDavConnection(cfg: WebDavConfig): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const endpoint = cleanPath(cfg.url, cfg.path)
    const res = await fetch(endpoint, {
      method: 'PROPFIND',
      headers: {
        ...authHeader(cfg),
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
    })
    if (res.status === 200 || res.status === 207 || res.status === 204) {
      return { ok: true, status: res.status }
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function uploadWebDavBackup(
  cfg: WebDavConfig,
  filename: string,
  bytes: Uint8Array
): Promise<boolean> {
  const endpoint = `${cleanPath(cfg.url, cfg.path)}/${filename}`
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      ...authHeader(cfg),
      'Content-Type': filename.endsWith('.kbackup')
        ? 'application/octet-stream'
        : 'application/zip',
    },
    body: bytes as unknown as BodyInit,
  })
  if (res.status >= 200 && res.status < 300) {
    return true
  }
  throw new Error(`Upload failed with HTTP ${res.status}`)
}

export async function listWebDavBackups(cfg: WebDavConfig): Promise<RemoteBackupItem[]> {
  const endpoint = cleanPath(cfg.url, cfg.path)
  const res = await fetch(endpoint, {
    method: 'PROPFIND',
    headers: {
      ...authHeader(cfg),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
  if (!res.ok && res.status !== 207) {
    throw new Error(`Listing failed with HTTP ${res.status}`)
  }

  const xml = await res.text()
  return parseWebDavResponses(xml, endpoint)
}

function parseWebDavResponses(xml: string, baseUrl: string): RemoteBackupItem[] {
  const items: RemoteBackupItem[] = []
  const responseRegex = /<[^:]*:?response[^>]*>([\s\S]*?)<\/[^:]*:?response>/gi
  let match: RegExpExecArray | null

  while ((match = responseRegex.exec(xml)) !== null) {
    const content = match[1]
    // Check if it is a directory / collection
    if (/<[^:]*:?collection\s*\/?>/i.test(content)) {
      continue
    }

    const hrefMatch = /<[^:]*:?href[^>]*>([^<]+)<\/[^:]*:?href>/i.exec(content)
    if (!hrefMatch) continue
    const href = hrefMatch[1].trim()

    const name = decodeURIComponent(href.split('/').filter(Boolean).pop() || '')
    if (!name || (!name.endsWith('.zip') && !name.endsWith('.kbackup'))) {
      continue
    }

    let size = 0
    const lengthMatch = /<[^:]*:?getcontentlength[^>]*>(\d+)<\/[^:]*:?getcontentlength>/i.exec(content)
    if (lengthMatch) {
      size = parseInt(lengthMatch[1], 10) || 0
    }

    let lastModified = ''
    const modMatch = /<[^:]*:?getlastmodified[^>]*>([^<]+)<\/[^:]*:?getlastmodified>/i.exec(content)
    if (modMatch) {
      lastModified = modMatch[1].trim()
    }

    const fileUrl = href.startsWith('http://') || href.startsWith('https://')
      ? href
      : `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(name)}`

    items.push({ name, size, lastModified, url: fileUrl })
  }

  return items
}

export async function downloadWebDavBackup(cfg: WebDavConfig, filename: string): Promise<Uint8Array> {
  const endpoint = `${cleanPath(cfg.url, cfg.path)}/${filename}`
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      ...authHeader(cfg),
    },
  })
  if (!res.ok) {
    throw new Error(`Download failed with HTTP ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}
