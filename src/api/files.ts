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
export async function uploadFile(f: { uri: string; name: string; mime: string; size: number }, onProgress?: (p: number) => void): Promise<RemoteFile> {
  if (!(f.size > 0) || f.size > FILE_MAX_BYTES) throw new ChatError('too_large')
  const t = token(); if (!t) throw new ChatError('auth')
  const task = FileSystem.createUploadTask(`${API_BASE}/v1/client/files`, f.uri, {
    httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.MULTIPART, fieldName: 'upload', mimeType: f.mime || 'application/octet-stream',
    headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, parameters: { filename: f.name },
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
export const isTerminal = (s: FileStatus) => s === 'ready' || s === 'failed'
