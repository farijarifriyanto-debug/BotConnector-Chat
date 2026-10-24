/** Small byte helpers so a source picture can be hashed exactly as the server will hash it. */
import { sha256 } from 'js-sha256'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64ToBytes(input: string): Uint8Array {
  const clean = String(input || '').replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = ALPHABET.indexOf(clean[i]), b = ALPHABET.indexOf(clean[i + 1] ?? 'A')
    const c = ALPHABET.indexOf(clean[i + 2] ?? 'A'), d = ALPHABET.indexOf(clean[i + 3] ?? 'A')
    const n = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63)
    out[p++] = (n >> 16) & 255
    if (i + 2 < clean.length) out[p++] = (n >> 8) & 255
    if (i + 3 < clean.length) out[p++] = n & 255
  }
  return out.subarray(0, p)
}

export function sha256Hex(bytes: Uint8Array): string {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return sha256.hex(copy.buffer as ArrayBuffer)
}

/** "data:image/jpeg;base64,AAA" -> { mime, base64 } */
export function splitDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:([^;,]+);base64,(.*)$/i.exec(String(dataUrl || ''))
  return m ? { mime: m[1], base64: m[2] } : null
}
