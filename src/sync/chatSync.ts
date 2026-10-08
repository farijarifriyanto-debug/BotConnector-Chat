// Chat history follows the account (text only: image bytes stay on the device). Same model as Studio sync:
// last write wins per conversation on `updatedAt`, tombstones for deletes, a cursor for incremental pulls.
import Storage from 'expo-sqlite/kv-store'
import { fetch } from 'expo/fetch'
import { WEB_BASE } from '../api/config'
import { deleteConv, getConv, listConvs, putConv } from '../db/convs'
import type { Conv, Msg } from '../lib/types'

const API = `${WEB_BASE}/api/workspace/chat-sync`
const APP_COOKIE = '__Host-bc-app'
let sessionToken: () => string | null = () => null
/** The sync service wants the app session (the same one the browser keeps in a cookie); the auth store says where it is. */
export const configureSync = (fn: () => string | null) => { sessionToken = fn }
const KEY = 'bc-chat-sync'
export const PUSH_PER_RUN = 20

export type SyncErrorKind = 'auth' | 'quota' | 'deleted' | 'privacy' | 'unavailable' | 'network' | 'rejected'
export class ChatSyncError extends Error {
  kind: SyncErrorKind
  constructor(kind: SyncErrorKind) { super(kind); Object.setPrototypeOf(this, new.target.prototype); this.name = 'ChatSyncError'; this.kind = kind }
}
export interface RemoteDoc { title?: string; model?: string; system?: string; web?: boolean; pinned?: boolean; archived?: boolean; titled?: boolean; kind?: string; projectId?: string; files?: { fileId?: string; name?: string; mime?: string; size?: number }[]; memory?: unknown[]; useMemory?: boolean; createdAt?: number; updatedAt?: number; messages?: Msg[] }
export interface RemoteConv { id: string; deleted?: boolean; doc?: RemoteDoc; rev: number }
export interface Usage { items: number; bytes: number; max_items: number; max_bytes: number }
interface Changes { items: RemoteConv[]; cursor: number; more: boolean; usage: Usage }

async function call<T>(action: string, json?: unknown, query = ''): Promise<T> {
  const tok = sessionToken(); if (!tok) throw new ChatSyncError('auth')
  let r: Response
  try {
    r = await fetch(`${API}/${action}${query}`, { method: json === undefined ? 'GET' : 'POST', headers: { accept: 'application/json', cookie: `${APP_COOKIE}=${tok}`, ...(json === undefined ? {} : { 'content-type': 'application/json', 'x-botconnector-web': '1', origin: WEB_BASE }) }, body: json === undefined ? undefined : JSON.stringify(json) })
  } catch { throw new ChatSyncError('network') }
  if (!r.ok) {
    let code = ''
    try { code = (await r.json())?.error?.code ?? '' } catch { /* empty */ }
    if (r.status === 401) throw new ChatSyncError('auth')
    if (code === 'PRIVACY_LOCAL_ONLY') throw new ChatSyncError('privacy')
    if (code === 'CHAT_QUOTA') throw new ChatSyncError('quota')
    if (code === 'CHAT_DELETED') throw new ChatSyncError('deleted')
    throw new ChatSyncError(r.status === 403 ? 'rejected' : 'unavailable')
  }
  return (await r.json().catch(() => ({}))) as T
}

export interface SyncState { enabled: boolean; cursor: number; deletes: string[]; lastAt?: number }
export type SyncPhase = 'idle' | 'syncing' | 'error' | 'full' | 'privacy' | 'auth' | 'rejected'
export interface SyncStatus { phase: SyncPhase; pending: number; usage?: Usage; lastAt?: number }

export function loadState(): SyncState {
  try {
    const o = JSON.parse(Storage.getItemSync(KEY) || '{}')
    return { enabled: o.enabled === true, cursor: Number.isInteger(o.cursor) && o.cursor >= 0 ? o.cursor : 0, deletes: Array.isArray(o.deletes) ? o.deletes.filter((x: unknown): x is string => typeof x === 'string').slice(0, 500) : [], lastAt: typeof o.lastAt === 'number' ? o.lastAt : undefined }
  } catch { return { enabled: false, cursor: 0, deletes: [] } }
}
export function saveState(s: SyncState) { try { Storage.setItemSync(KEY, JSON.stringify(s)) } catch { /* not persisted */ } }

export const isDirty = (c: Conv) => !c.local && (c.messages.length > 0 || !!c.kind) && c.updatedAt > (c.syncedAt ?? 0)
export const pendingCount = (convs: Conv[], deletes: string[]) => convs.filter(isDirty).length + deletes.length

/** What leaves the device: no image bytes, no local-only fields. */
export function toDoc(c: Conv): RemoteDoc {
  return {
    title: c.title, model: c.model, system: c.system, web: c.web, pinned: c.pinned === true, archived: c.archived === true, titled: c.titled === true, kind: c.kind, projectId: c.projectId, files: c.files?.filter(f => f.fileId && f.status !== 'uploading').map(({ fileId, name, mime, size }) => ({ fileId, name, mime, size })), memory: c.memory, useMemory: c.useMemory, createdAt: c.createdAt, updatedAt: c.updatedAt,
    messages: c.messages.map(({ variants: _v, ...m }) => ({ ...m, attachments: m.attachments?.map(({ dataUrl: _d, uri: _u, ...a }) => a) })),
  }
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Server data is checked again before it is stored locally. */
export function fromRemote(r: RemoteConv): Conv | null {
  const d = r.doc; if (!d || r.deleted || !Array.isArray(d.messages)) return null
  const messages: Msg[] = []
  for (const m of d.messages.slice(0, 2000)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.id !== 'string' || typeof m.content !== 'string') continue
    messages.push({
      id: m.id, role: m.role, content: m.content, createdAt: num(m.createdAt) ?? 1,
      ...(typeof m.reasoning === 'string' ? { reasoning: m.reasoning } : {}), ...(typeof m.model === 'string' ? { model: m.model } : {}), ...(typeof m.error === 'string' ? { error: m.error } : {}), ...(num(m.ms) !== undefined ? { ms: num(m.ms) } : {}),
      ...(Array.isArray(m.sources) ? { sources: m.sources.filter(s => s && typeof s.url === 'string' && /^https?:\/\//.test(s.url)).map(s => ({ title: str(s.title, 300), url: s.url })) } : {}),
      ...(Array.isArray(m.searched) ? { searched: m.searched.filter((x): x is string => typeof x === 'string') } : {}),
      ...(Array.isArray(m.attachments) ? { attachments: m.attachments.filter(a => a && (a.kind === 'image' || a.kind === 'file')).map(a => ({ kind: a.kind, name: str(a.name, 200) || 'file', mime: str(a.mime, 100), size: num(a.size) ?? 0, ...(typeof a.fileId === 'string' ? { fileId: a.fileId, status: a.status } : {}) })) } : {}),
    })
  }
  const updatedAt = num(d.updatedAt) ?? Date.now()
  return { id: r.id, title: str(d.title, 200), model: str(d.model, 160), system: str(d.system, 4000), web: d.web === true, pinned: d.pinned === true, archived: d.archived === true, ...(d.titled === true ? { titled: true } : {}), ...(d.kind === 'project' || d.kind === 'memory' ? { kind: d.kind } : {}), ...(typeof d.projectId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(d.projectId) ? { projectId: d.projectId } : {}),
    ...(Array.isArray(d.files) ? { files: d.files.filter(f => f && typeof f.fileId === 'string' && /^file_bc_[0-9a-fA-F-]{36}$/.test(f.fileId)).slice(0, 10).map(f => ({ fileId: f.fileId as string, name: str(f.name, 200) || 'file', mime: str(f.mime, 100), size: num(f.size) ?? 0, status: 'ready' as const })) } : {}),
    ...(Array.isArray(d.memory) ? { memory: d.memory.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 100).map(x => x.slice(0, 400)) } : {}), ...(d.useMemory === false ? { useMemory: false } : {}), createdAt: num(d.createdAt) ?? updatedAt, updatedAt, syncedAt: updatedAt, messages }
}

let running: Promise<SyncStatus> | null = null
export function runSync(): Promise<SyncStatus> {
  if (!running) running = pass().finally(() => { running = null })
  return running
}

async function pass(): Promise<SyncStatus> {
  const st = loadState()
  let usage: Usage | undefined
  const finish = async (phase: SyncPhase): Promise<SyncStatus> => {
    const pending = pendingCount(await listConvs(), st.deletes)
    if (phase === 'idle') st.lastAt = Date.now()
    saveState(st)
    return { phase, pending, usage, lastAt: st.lastAt }
  }
  try {
    for (;;) {   // pull
      const res = await call<Changes>('changes', undefined, `?since=${st.cursor}`)
      usage = res.usage
      for (const r of res.items) {
        if (r.deleted) { await deleteConv(r.id).catch(() => {}); st.deletes = st.deletes.filter(x => x !== r.id); continue }
        const remote = fromRemote(r); if (!remote) continue
        const local = await getConv(r.id)
        if (!local) { await putConv(remote); continue }
        if (remote.updatedAt > local.updatedAt) await putConv({ ...remote, messages: remote.messages.map(m => { const old = local.messages.find(x => x.id === m.id); return old?.attachments?.some(a => a.dataUrl || a.uri) && m.attachments ? { ...m, attachments: m.attachments.map(a => old.attachments!.find(o => o.name === a.name && (o.dataUrl || o.uri)) ?? a) } : m }) })   // keep this device's image previews and files
        else if (remote.updatedAt === local.updatedAt && local.syncedAt !== remote.updatedAt) await putConv({ ...local, syncedAt: remote.updatedAt })
      }
      st.cursor = res.cursor; saveState(st)
      if (!res.more) break
    }
    for (const id of [...st.deletes]) { await call('delete', { id }); st.deletes = st.deletes.filter(x => x !== id); saveState(st) }
    let pushed = 0
    for (const c of (await listConvs()).filter(isDirty)) {
      if (pushed >= PUSH_PER_RUN) break
      try { await call('put', { id: c.id, doc: toDoc(c) }) } catch (e) {
        if (e instanceof ChatSyncError && e.kind === 'deleted') { await deleteConv(c.id).catch(() => {}); continue }
        throw e
      }
      const fresh = await getConv(c.id)   // it may have changed while the request was in flight: keep it dirty then
      if (fresh) await putConv({ ...fresh, syncedAt: c.updatedAt })
      pushed++
    }
    return await finish('idle')
  } catch (e) {
    if (e instanceof ChatSyncError) return await finish(e.kind === 'quota' ? 'full' : e.kind === 'privacy' ? 'privacy' : e.kind === 'auth' ? 'auth' : e.kind === 'rejected' ? 'rejected' : 'error')
    return await finish('error')
  }
}

async function resetMarks() { for (const c of await listConvs()) if (c.syncedAt !== undefined) await putConv({ ...c, syncedAt: undefined }) }
export async function enableSync(): Promise<void> { await resetMarks(); saveState({ enabled: true, cursor: 0, deletes: [] }) }
/** Turn sync off. With `purge` also remove the account copy (conversations stay on this device). */
export async function disableSync(purge: boolean): Promise<void> {
  if (purge) { await call('purge', {}); await resetMarks() }
  saveState({ enabled: false, cursor: 0, deletes: [] })
}

export const markDeleted = (id: string) => { const s = loadState(); if (!s.enabled) return; if (!s.deletes.includes(id)) s.deletes = [...s.deletes, id].slice(-500); saveState(s) }
