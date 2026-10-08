import * as Crypto from 'expo-crypto'
import { sha256 } from 'js-sha256'

export const toBase64Url = (b64: string): string => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function bytesToBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return toBase64Url(btoa(s))
}

/** 32 random bytes as an unguessable URL-safe string (state and code verifier). */
export const randomToken = (): string => bytesToBase64Url(Crypto.getRandomBytes(32))

/** PKCE S256: base64url(sha256(verifier)). Pure JavaScript, so the exact bytes are unit-tested against the RFC 7636 example. */
export async function challengeFor(verifier: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(sha256.arrayBuffer(verifier)))
}

/** code + state from the botconnector://auth/callback?code=…&state=… address; null when it is not that address. */
export function parseCallback(url: string): { code: string; state: string } | null {
  const m = /^botconnector:\/\/auth\/callback\?(.*)$/.exec(url.split('#')[0])
  if (!m) return null
  const q = new URLSearchParams(m[1])
  const code = q.get('code'), state = q.get('state')
  return code && state ? { code, state } : null
}
