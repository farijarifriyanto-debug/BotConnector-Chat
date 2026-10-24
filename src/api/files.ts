// Documents for "ask about this file": uploaded once to the account's file service, then referenced by id in every question.
import * as FileSystem from 'expo-file-system/legacy'
import { API_BASE } from './config'
import { classify, getJson } from './api'
import { ChatError } from '../lib/types'

export const FILE_MAX_BYTES = 512 * 1024 * 1024
export type FileStatus = 'uploading' | 'uploaded' | 'queued' | 'processing' | 'waiting_parser' | 'ocr_required' | 'waiting_retrieval' | 'ready' | 'failed'
export interface RemoteFile { id: string; status: FileStatus; pollAfterMs?: number; errorCode?: string }
const parse = (j: any): RemoteFile => ({ id: String(j?.id ?? ''), status: (typeof j?.status === 'string' ? j.status : 'processing') as FileStatus, pollAfterMs: typeof j?.poll_after_ms === 'number' ? j.poll_after_ms : undefined, errorCode: typeof j?.error?.code === 'string' ? j.error.code : undefined })

let token: () => string | null = () => null
export const configureFiles = (fn: () => string | null) => { token = fn }

/** Multipart upload straight from the file on disk (never read into memory). Field name "upload" is what the service expects. */
export async function uploadFile(f: { uri: string; name: string; mime: string; size: number }, onProgress?: (p: number) => void, cloudProcessingAllowed = false): Promise<RemoteFile> {
  if (!(f.size > 0) || f.size > FILE_MAX_BYTES) throw new ChatError('too_large')
  const t = token(); if (!t) throw new ChatError('auth')
  const task = FileSystem.createUploadTask(`${API_BASE}/v1/client/files`, f.uri, {
    httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.MULTIPART, fieldName: 'upload', mimeType: f.mime || 'application/octet-stream',
    headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, parameters: { filename: f.name, cloud_processing_allowed: String(cloudProcessingAllowed), contains_sensitive_data: String(!cloudProcessingAllowed) },
  }, p => onProgress?.(p.totalBytesExpectedToSend > 0 ? p.totalBytesSent / p.totalBytesExpectedToSend : 0))
  let res: Awaited<ReturnType<typeof task.uploadAsync>>
  try { res = await task.uploadAsync() } catch { throw new ChatError('network') }
  if (!res) throw new ChatError('aborted')
  let body: any = {}; try { body = JSON.parse(res.body || '{}') } catch { /* handled by the status check */ }
  if (res.status < 200 || res.status >= 300) throw classify(res.status, typeof body?.error?.code === 'string' ? body.error.code : undefined)
  const out = parse(body); if (!out.id.startsWith('file_bc_')) throw new ChatError('unavailable')
  return out
}
export const fileStatus = async (id: string, signal?: AbortSignal): Promise<RemoteFile> => parse(await getJson<any>(`/v1/client/files/${encodeURIComponent(id)}`, signal))
export interface RemoteFileInfo extends RemoteFile { name?: string; size?: number; createdAt?: number; mime?: string }
/** What the service reports about one uploaded document (name and size are shown in a project's list). */
export async function fileInfo(id: string, signal?: AbortSignal): Promise<RemoteFileInfo> {
  const j = await getJson<any>(`/v1/client/files/${encodeURIComponent(id)}`, signal)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return {
    ...parse(j),
    ...(typeof j?.filename === 'string' ? { name: j.filename } : typeof j?.name === 'string' ? { name: j.name } : {}),
    ...(num(j?.size) !== undefined ? { size: num(j?.size) } : {}),
    ...(typeof j?.mime === 'string' ? { mime: j.mime } : typeof j?.content_type === 'string' ? { mime: j.content_type } : {}),
    ...(typeof j?.created_at === 'string' ? { createdAt: Date.parse(j.created_at) || undefined } : num(j?.created_at) !== undefined ? { createdAt: num(j.created_at) } : {}),
  }
}

/** Downloads the original document (bytes as uploaded) to the cache and returns its local uri and mime. */
export async function downloadFile(id: string, signal?: AbortSignal): Promise<{ uri: string; mime: string; name: string }> {
  const t = token(); if (!t) throw new ChatError('auth')
  const head = await fetch(`${API_BASE}/v1/client/files/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, signal })
  const meta = head.ok ? await head.json().catch(() => ({})) : {}
  const name = typeof meta?.filename === 'string' && meta.filename ? meta.filename : `${id}`
  const mime = typeof meta?.mime === 'string' ? meta.mime : typeof meta?.content_type === 'string' ? meta.content_type : 'application/octet-stream'
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)
  const uri = `${FileSystem.cacheDirectory ?? ''}${id}-${safe}`
  const r = await FileSystem.downloadAsync(`${API_BASE}/v1/client/files/${encodeURIComponent(id)}/content`, uri, { headers: { authorization: `Bearer ${t}` } })
  if (r.status < 200 || r.status >= 300) throw new ChatError('unavailable')
  return { uri: r.uri, mime, name }
}
export const isTerminal = (s: FileStatus) => s === 'ready' || s === 'failed'
