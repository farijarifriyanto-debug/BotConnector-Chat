import './helpers/mocks'
import { decodeProviderImport } from '../src/lib/providerImport'

const qr = (obj: unknown) => 'ai-provider:v1:' + btoa(Array.from(new TextEncoder().encode(JSON.stringify(obj)), byte => String.fromCharCode(byte)).join(''))
describe('Kelivo provider configuration', () => {
  it('works without a browser atob global on native', () => {
    const payload = qr({ type: 'openai', name: '日本', apiKey: 'test' })
    const original = globalThis.atob
    try {
      Object.defineProperty(globalThis, 'atob', { configurable: true, writable: true, value: undefined })
      expect(decodeProviderImport(payload).name).toBe('日本')
    } finally { globalThis.atob = original }
  })
  it('decodes UTF8 names and keeps the supplied key and endpoint', () => {
    expect(decodeProviderImport(qr({ type: 'openai', name: 'Pribadi 日本', apiKey: 'test-only', baseUrl: 'https://example.com/v1' }))).toEqual({ name: 'Pribadi 日本', apiKey: 'test-only', baseUrl: 'https://example.com/v1' })
  })
  it('allows missing keys so the existing form can ask for one', () => {
    expect(decodeProviderImport(qr({ type: 'openai', name: '', apiKey: '' }))).toEqual({ name: 'OpenAI', apiKey: '', baseUrl: 'https://api.openai.com/v1' })
  })
  it('uses the existing Gemini OpenAI-compatible transport for google QR', () => {
    expect(decodeProviderImport(qr({ type: 'google', name: 'Gemini', apiKey: 'test-only' })).baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
  })
  it('preserves a private-network endpoint', () => {
    expect(decodeProviderImport(qr({ type: 'openai', baseUrl: 'http://192.168.1.4:11434/v1' })).baseUrl).toBe('http://192.168.1.4:11434/v1')
  })
  it.each(['claude', 'oauth', 'other'])('rejects unsupported %s rather than silently misrouting', type => {
    expect(() => decodeProviderImport(qr({ type }))).toThrow('unsupported')
  })
  it.each(['https://name:secret@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1#fragment', 'http://example.com/v1', 'javascript:alert(1)'])('rejects a destination that cannot be used unchanged: %s', baseUrl => {
    expect(() => decodeProviderImport(qr({ type: 'openai', baseUrl }))).toThrow('url')
  })
  it.each(['https://example.com', 'ai-provider:v1:!!', 'ai-provider:v1:W10=', 'ai-provider:v1:/w==', 'ai-provider:v1:' + 'a'.repeat(20000)])('rejects malformed payload without echoing it', raw => {
    expect(() => decodeProviderImport(raw)).toThrow('format')
  })
  it('rejects non-string fields without echoing a key', () => {
    expect(() => decodeProviderImport(qr({ type: 'openai', apiKey: { secret: 'do-not-echo' } }))).toThrow('format')
  })
})
