import { normalizeBaseUrl } from '../api/custom'
import { base64ToBytes } from './bytes'

export interface ProviderImport { name: string; baseUrl: string; apiKey: string; kind?: 'anthropic' }
export class ProviderImportError extends Error {
  constructor(public readonly code: 'format' | 'unsupported' | 'url') { super(code); this.name = 'ProviderImportError' }
}
const PREFIX = 'ai-provider:v1:'

/** Kelivo share format. Never put the original payload or key in an error. */
export function decodeProviderImport(raw: string): ProviderImport {
  const text = raw.trim()
  if (text.length > 16384 || !text.startsWith(PREFIX)) throw new ProviderImportError('format')
  const encoded = text.slice(PREFIX.length)
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ProviderImportError('format')
  let obj: Record<string, unknown>
  try {
    const bytes = base64ToBytes(encoded)
    const decoded = decodeURIComponent(Array.from(bytes, c => '%' + c.toString(16).padStart(2, '0')).join(''))
    const value: unknown = JSON.parse(decoded)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    obj = value as Record<string, unknown>
    for (const field of ['type', 'name', 'apiKey', 'baseUrl']) {
      if (obj[field] !== undefined && typeof obj[field] !== 'string') throw new Error()
    }
  } catch { throw new ProviderImportError('format') }
  if (obj.type !== 'openai' && obj.type !== 'google' && obj.type !== 'claude' && obj.type !== 'anthropic') throw new ProviderImportError('unsupported')
  const claude = obj.type === 'claude' || obj.type === 'anthropic'
  const google = obj.type === 'google'
  const supplied = (obj.baseUrl as string | undefined)?.trim()
  let baseUrl = supplied || (google ? 'https://generativelanguage.googleapis.com/v1beta' : claude ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')
  try {
    const u = new URL(baseUrl)
    if (u.search || u.hash || u.username || u.password) throw new Error()
  } catch { throw new ProviderImportError('url') }
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized.ok) throw new ProviderImportError('url')
  baseUrl = normalized.url
  if (claude) {
    // The native Messages transport appends /messages, so only a /v1-style base can be spoken to honestly.
    if (!baseUrl.endsWith('/v1')) throw new ProviderImportError('unsupported')
    return { name: (obj.name as string | undefined)?.trim().slice(0, 40) || 'Anthropic', baseUrl, apiKey: (obj.apiKey as string | undefined)?.trim() || '', kind: 'anthropic' as const }
  }
  if (google) {
    // This application has no native Gemini transport; adapt only the known official base.
    if (!['https://generativelanguage.googleapis.com/v1beta', 'https://generativelanguage.googleapis.com/v1beta/openai'].includes(baseUrl)) throw new ProviderImportError('unsupported')
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'
  }
  return { name: (obj.name as string | undefined)?.trim().slice(0, 40) || (google ? 'Google Gemini' : 'OpenAI'), baseUrl, apiKey: (obj.apiKey as string | undefined)?.trim() || '' }
}
