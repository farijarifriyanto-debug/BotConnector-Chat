import {
  isEncryptedBackup,
  encryptBackupBytes,
  decryptBackupBytes,
  KELIVO_MAGIC,
  KELIVO_HEADER_LENGTH,
} from '../src/lib/backupEncryption'

// Official Kelivo fixture generated with PBKDF2-HMAC-SHA256 (600,000 iterations) + AES-256-GCM.
const KELIVO_FIXTURE_B64 =
  'S0VMSVZFTkMCAAECAwQFBgcICQoLDA0ODxAREhMUFRYXAAAAAAAAADDfv9sQMhLcGKdBs+O9GOv9+MuXeoLSOUhIh3sqp/OT1ePJ5gwXLAZaLMdjSR/ez4GfRT25MBu1ge4+HpO4y/WM'
const KELIVO_FIXTURE_PASSWORD = '  口令🔐\u0000 secret  '
const KELIVO_FIXTURE_PLAINTEXT = 'Kelivo encrypted backup\nAPI key and chat content'

const bytesFromB64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0))

describe('backup encryption (Kelivo parity)', () => {
  it('detects encrypted backups by magic header', () => {
    const fixture = bytesFromB64(KELIVO_FIXTURE_B64)
    expect(isEncryptedBackup(fixture)).toBe(true)
    expect(isEncryptedBackup(new Uint8Array([1, 2, 3, 4]))).toBe(false)
    expect(isEncryptedBackup(new Uint8Array(50))).toBe(false)
  })

  it('decrypts the official Kelivo test vector', async () => {
    const fixture = bytesFromB64(KELIVO_FIXTURE_B64)
    const decrypted = await decryptBackupBytes(fixture, KELIVO_FIXTURE_PASSWORD)
    const text = new TextDecoder().decode(decrypted)
    expect(text).toBe(KELIVO_FIXTURE_PLAINTEXT)
  })

  it('rejects wrong password with backup_decryption_failed error', async () => {
    const fixture = bytesFromB64(KELIVO_FIXTURE_B64)
    await expect(decryptBackupBytes(fixture, 'wrong-password')).rejects.toThrow('backup_decryption_failed')
  })

  it('rejects empty password', async () => {
    const sample = new Uint8Array([1, 2, 3])
    await expect(encryptBackupBytes(sample, '')).rejects.toThrow('backup_password_empty')
  })

  it('roundtrips arbitrary plaintext data across chunk boundaries', async () => {
    const sample = new TextEncoder().encode('Hello BotConnector encrypted backup test string!')
    const password = 'my-secure-password-123!'
    const encrypted = await encryptBackupBytes(sample, password)
    expect(isEncryptedBackup(encrypted)).toBe(true)
    expect(encrypted.length).toBeGreaterThan(KELIVO_HEADER_LENGTH)

    const decrypted = await decryptBackupBytes(encrypted, password)
    expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(sample))
  })
})
