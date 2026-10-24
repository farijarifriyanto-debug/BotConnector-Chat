/**
 * Backup encryption & decryption compatible with Kelivo's format (version 2 KELIVENC).
 *
 * Header (41 bytes):
 * - Magic (8 bytes): "KELIVENC"
 * - Version (1 byte): 0x02
 * - Salt (16 bytes)
 * - Nonce prefix (8 bytes)
 * - Plaintext length (8 bytes, big-endian uint64)
 *
 * KDF: PBKDF2-HMAC-SHA256(password, salt, 600000, 32)
 * Cipher: AES-256-GCM in 1 MiB chunks
 * Nonce: noncePrefix (8B) || uint32_be(chunkIndex) (4B) -> 12B
 * AAD: header (41B) || uint32_be(chunkIndex) (4B) -> 45B
 */

export const KELIVO_MAGIC = 'KELIVENC'
export const KELIVO_VERSION = 2
export const KELIVO_HEADER_LENGTH = 41
export const KELIVO_CHUNK_SIZE = 1024 * 1024 // 1 MiB

function getCryptoSubtle(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto')
    if (nodeCrypto.webcrypto?.subtle) return nodeCrypto.webcrypto.subtle
  } catch {
    // ignore
  }
  throw new Error('WebCrypto subtle not available')
}

function getRandomBytes(len: number): Uint8Array {
  const buf = new Uint8Array(len)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(buf)
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto')
    return nodeCrypto.randomBytes(len)
  } catch {
    for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256)
    return buf
  }
}

export function isEncryptedBackup(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 8) return false
  const magic = new TextDecoder().decode(bytes.subarray(0, 8))
  return magic === KELIVO_MAGIC
}

export async function encryptBackupBytes(plaintext: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password || password.length === 0) {
    throw new Error('backup_password_empty')
  }

  const subtle = getCryptoSubtle()
  const salt = getRandomBytes(16)
  const noncePrefix = getRandomBytes(8)
  const plainLength = BigInt(plaintext.length)

  // Header 41 bytes
  const header = new Uint8Array(KELIVO_HEADER_LENGTH)
  header.set(new TextEncoder().encode(KELIVO_MAGIC), 0)
  header[8] = KELIVO_VERSION
  header.set(salt, 9)
  header.set(noncePrefix, 25)
  new DataView(header.buffer, header.byteOffset, header.byteLength).setBigUint64(33, plainLength, false)

  const passwordBytes = new TextEncoder().encode(password)
  const baseKey = await subtle.importKey('raw', passwordBytes as unknown as BufferSource, 'PBKDF2', false, ['deriveKey'])

  const aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const chunksCount = Math.max(1, Math.ceil(plaintext.length / KELIVO_CHUNK_SIZE))
  const encryptedChunks: Uint8Array[] = []

  for (let i = 0; i < chunksCount; i++) {
    const chunkPlain = plaintext.subarray(
      i * KELIVO_CHUNK_SIZE,
      Math.min(plaintext.length, (i + 1) * KELIVO_CHUNK_SIZE)
    )

    const nonce = new Uint8Array(12)
    nonce.set(noncePrefix, 0)
    new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength).setUint32(8, i, false)

    const aad = new Uint8Array(45)
    aad.set(header, 0)
    new DataView(aad.buffer, aad.byteOffset, aad.byteLength).setUint32(41, i, false)

    const encrypted = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce as unknown as BufferSource,
        additionalData: aad as unknown as BufferSource,
        tagLength: 128,
      },
      aesKey,
      chunkPlain as unknown as BufferSource
    )
    encryptedChunks.push(new Uint8Array(encrypted))
  }

  const totalLength = KELIVO_HEADER_LENGTH + encryptedChunks.reduce((acc, c) => acc + c.length, 0)
  const out = new Uint8Array(totalLength)
  out.set(header, 0)
  let offset = KELIVO_HEADER_LENGTH
  for (const c of encryptedChunks) {
    out.set(c, offset)
    offset += c.length
  }

  return out
}

export async function decryptBackupBytes(encrypted: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password || password.length === 0) {
    throw new Error('backup_password_empty')
  }
  if (!encrypted || encrypted.length < KELIVO_HEADER_LENGTH) {
    throw new Error('backup_decryption_failed')
  }

  const magic = new TextDecoder().decode(encrypted.subarray(0, 8))
  if (magic !== KELIVO_MAGIC) {
    throw new Error('not_encrypted')
  }
  const version = encrypted[8]
  if (version !== KELIVO_VERSION) {
    throw new Error('unsupported_version')
  }

  const subtle = getCryptoSubtle()
  const salt = encrypted.subarray(9, 25)
  const noncePrefix = encrypted.subarray(25, 33)
  const plainLength = Number(
    new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength).getBigUint64(33, false)
  )
  const header = encrypted.subarray(0, KELIVO_HEADER_LENGTH)

  const passwordBytes = new TextEncoder().encode(password)
  const baseKey = await subtle.importKey('raw', passwordBytes as unknown as BufferSource, 'PBKDF2', false, ['deriveKey'])

  const aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const out = new Uint8Array(plainLength)
  let offsetEnc = KELIVO_HEADER_LENGTH
  let offsetPlain = 0
  let chunkIndex = 0

  while (offsetEnc < encrypted.length || (plainLength === 0 && chunkIndex === 0)) {
    const expectedPlainChunkSize = Math.min(KELIVO_CHUNK_SIZE, plainLength - offsetPlain)
    const expectedCipherChunkSize = expectedPlainChunkSize + 16 // 16-byte auth tag
    if (offsetEnc + expectedCipherChunkSize > encrypted.length) {
      throw new Error('backup_decryption_failed')
    }
    const chunkEnc = encrypted.subarray(offsetEnc, offsetEnc + expectedCipherChunkSize)

    const nonce = new Uint8Array(12)
    nonce.set(noncePrefix, 0)
    new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength).setUint32(8, chunkIndex, false)

    const aad = new Uint8Array(45)
    aad.set(header, 0)
    new DataView(aad.buffer, aad.byteOffset, aad.byteLength).setUint32(41, chunkIndex, false)

    let decryptedBuf: ArrayBuffer
    try {
      decryptedBuf = await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonce as unknown as BufferSource,
          additionalData: aad as unknown as BufferSource,
          tagLength: 128,
        },
        aesKey,
        chunkEnc as unknown as BufferSource
      )
    } catch {
      throw new Error('backup_decryption_failed')
    }

    out.set(new Uint8Array(decryptedBuf), offsetPlain)
    offsetPlain += expectedPlainChunkSize
    offsetEnc += expectedCipherChunkSize
    chunkIndex++
    if (plainLength === 0) break
  }

  return out
}
