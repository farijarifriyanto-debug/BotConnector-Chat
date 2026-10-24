import './helpers/mocks'
import { base64ToBytes, sha256Hex, splitDataUrl } from '../src/lib/bytes'

/** Known-answer vectors, so the decoder and the hash are checked against something outside this code. */
describe('source picture hashing', () => {
  it('decodes base64 exactly', () => {
    const b64 = 'Z2FtYmFyIGNvbnRvaCB1bnR1ayB2ZW8='
    expect(String.fromCharCode(...base64ToBytes(b64))).toBe('gambar contoh untuk veo')
  })

  it('hashes the decoded bytes the way the server will', () => {
    expect(sha256Hex(base64ToBytes('Z2FtYmFyIGNvbnRvaCB1bnR1ayB2ZW8=')))
      .toBe('0116a6bf00c9bad790eaa95b50d6eda6588c6465b667769b8360a78fe426b91f')
    expect(sha256Hex(base64ToBytes('YWJj'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('handles padding and a payload far larger than one chunk', () => {
    const bytes = new Uint8Array(1024 * 1024 + 7).fill(7)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)
    const back = base64ToBytes(b64)
    expect(back.length).toBe(bytes.length)
    expect(back[0]).toBe(7)
    expect(sha256Hex(back)).toHaveLength(64)
  })

  it('splits a data URL into mime and payload', () => {
    expect(splitDataUrl('data:image/jpeg;base64,QUJD')).toEqual({ mime: 'image/jpeg', base64: 'QUJD' })
    expect(splitDataUrl('https://example.com/a.jpg')).toBeNull()
    expect(splitDataUrl('')).toBeNull()
  })
})
