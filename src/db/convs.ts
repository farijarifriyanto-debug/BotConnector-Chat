// Conversations live in SQLite as one JSON document per chat (the same Conv shape the web Chat syncs), so account sync can move them as they are.
import * as SQLite from 'expo-sqlite'
import type { Conv } from '../lib/types'

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null
function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('botconnector-chat.db')
    await d.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS convs (id TEXT PRIMARY KEY NOT NULL, updated_at INTEGER NOT NULL, doc TEXT NOT NULL); CREATE INDEX IF NOT EXISTS convs_updated ON convs (updated_at DESC);')
    return d
  })()
  return dbPromise
}

export async function listConvs(): Promise<Conv[]> {
  const rows = await (await db()).getAllAsync<{ doc: string }>('SELECT doc FROM convs ORDER BY updated_at DESC')
  const out: Conv[] = []
  for (const r of rows) { try { const c = JSON.parse(r.doc) as Conv; if (c && typeof c.id === 'string' && Array.isArray(c.messages)) out.push(c) } catch { /* a damaged row is skipped, not fatal */ } }
  return out
}
export async function putConv(c: Conv): Promise<void> { await (await db()).runAsync('INSERT OR REPLACE INTO convs (id, updated_at, doc) VALUES (?, ?, ?)', c.id, c.updatedAt, JSON.stringify(c)) }
export async function deleteConv(id: string): Promise<void> { await (await db()).runAsync('DELETE FROM convs WHERE id = ?', id) }
export async function clearConvs(): Promise<void> { await (await db()).runAsync('DELETE FROM convs') }
