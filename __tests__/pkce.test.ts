jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)), randomUUID: () => require('crypto').randomUUID() }))
import { challengeFor, parseCallback, randomToken, toBase64Url } from '../src/auth/pkce'

describe('PKCE helpers', () => {
  it('produces the RFC 7636 S256 challenge for the RFC example verifier', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('url-safe base64 has no + / =', () => { expect(toBase64Url('a+b/c==')).toBe('a-b_c') })
  it('random tokens are long and different each time', () => { const a = randomToken(), b = randomToken(); expect(a).not.toBe(b); expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/) })
  it('accepts only this app\'s callback address with code and state', () => {
    expect(parseCallback('botconnector://auth/callback?code=c1&state=s1')).toEqual({ code: 'c1', state: 's1' })
    expect(parseCallback('botconnector://auth/callback?code=c1')).toBeNull()
    expect(parseCallback('https://evil.example/auth/callback?code=c&state=s')).toBeNull()
    expect(parseCallback('botconnector://other/callback?code=c&state=s')).toBeNull()
  })
})
