import Storage from 'expo-sqlite/kv-store'
import { clearSession } from '../auth/session'
import { disableSync } from '../sync/chatSync'

const DONE = 'bc.standalone.v1'

/**
 * One-way move to the standalone app: the old account session credential is dropped and account sync is
 * turned off (metadata only — no purge). Chats, provider configs and `bc.pk.*` keys, local models, memory,
 * preferences and backups all stay. This never calls `useAuth.logout`: logout wipes the local chats.
 * Safe to repeat: every step is idempotent and the marker is written last, so a crash simply retries.
 */
export async function migrateToStandalone(): Promise<void> {
  try { if (Storage.getItemSync(DONE) === '1') return } catch { /* unreadable: run the steps anyway */ }
  await clearSession()
  await disableSync(false).catch(() => {})
  try { Storage.setItemSync(DONE, '1') } catch { /* not persisted: retried on the next start */ }
}
