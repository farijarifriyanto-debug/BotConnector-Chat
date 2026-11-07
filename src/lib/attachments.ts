import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { unzipSync } from 'fflate'
import { base64ToBytes } from './bytes'
import * as ImagePicker from 'expo-image-picker'
import { newId } from './conv'
import type { Attachment } from './types'

export const MAX_IMAGES = 4
const MAX_EDGE = 1568
export const DOC_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.*', 'application/vnd.ms-*', 'text/*', 'application/json', 'application/xml']
export type LocalAttachment = Attachment & { id: string; sourceUri?: string; progress?: number }

/** A photo, scaled down and re-encoded so a few of them stay far below the request limit. */
async function toImage(a: ImagePicker.ImagePickerAsset): Promise<LocalAttachment> {
  const wide = Math.max(a.width || 0, a.height || 0) > MAX_EDGE
  const r = await ImageManipulator.manipulateAsync(a.uri, wide ? [{ resize: a.width >= a.height ? { width: MAX_EDGE } : { height: MAX_EDGE } }] : [], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true })
  const b64 = r.base64 ?? ''
  return { id: newId(), kind: 'image', name: a.fileName || 'photo.jpg', mime: 'image/jpeg', size: Math.round(b64.length * 0.75), dataUrl: `data:image/jpeg;base64,${b64}` }
}
export async function pickPhotos(room: number): Promise<LocalAttachment[]> {
  if (room <= 0) return []
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 1 })
  return r.canceled ? [] : Promise.all(r.assets.slice(0, room).map(toImage))
}
/** null = permission denied. */
export async function takePhoto(): Promise<LocalAttachment | null | 'denied'> {
  const perm = await ImagePicker.requestCameraPermissionsAsync(); if (!perm.granted) return 'denied'
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
  return r.canceled || !r.assets[0] ? null : toImage(r.assets[0])
}
export async function pickDocument(): Promise<LocalAttachment | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: DOC_TYPES, copyToCacheDirectory: true, multiple: false })
  const f = r.canceled ? null : r.assets[0]; if (!f) return null
  return { id: newId(), kind: 'file', name: f.name, mime: f.mimeType || 'application/octet-stream', size: f.size ?? 0, sourceUri: f.uri, status: 'uploading', progress: 0 }
}

/** Plain-text documents the phone can read by itself (audit F3): the extension decides, the mime fills in. */
export const isPlainDoc = (name: string, mime: string): boolean => {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (ext && ['txt', 'md', 'markdown', 'csv', 'json'].includes(ext)) return true
  if (ext && ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'exe', 'bin', 'zip'].includes(ext)) return false
  return /^text\//i.test(mime) || mime === 'application/json'
}
/** Documents are read whole but clipped: 80 pages of notes would blow past every request limit. */
export const DOC_TEXT_MAX = 40_000
export const clipDocText = (text: string): string =>
  text.length <= DOC_TEXT_MAX ? text : text.slice(0, DOC_TEXT_MAX) + `\n\n[file truncated; only the first ${DOC_TEXT_MAX} characters were included]`

const DOCX_MIMES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'])

/** Word text on this phone (audit F3): unzip the package, paragraphs become newlines, tags vanish, entities decoded. */
export function extractDocxText(bytes: Uint8Array): string {
  const xml = new TextDecoder().decode(unzipSync(bytes)['word/document.xml'] ?? new Uint8Array())
  const raw = xml.replace(/<\/w:p>/g, '\n').replace(/<[a-zA-Z/][^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  return raw.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length).join('\n')
}

/**
 * Pick a document and read its text right here, with no upload and no account (the reference app's
 * on-device extraction, text formats only until a PDF/DOCX parser exists). 'unsupported' - the type
 * is not readable on this phone yet; 'error' - the file could not be read; null - cancelled.
 */
export async function pickLocalDocument(): Promise<LocalAttachment | null | 'unsupported' | 'error'> {
  const r = await DocumentPicker.getDocumentAsync({ type: DOC_TYPES, copyToCacheDirectory: true, multiple: false })
  const f = r.canceled ? null : r.assets[0]; if (!f) return null
  const mime = f.mimeType || 'application/octet-stream'
  const ext = (f.name.split('.').pop() ?? '').toLowerCase()
  const isDocx = ext === 'docx' || DOCX_MIMES.has(mime)
  if (!isPlainDoc(f.name, mime) && !isDocx) return 'unsupported'
  try {
    if (isDocx) {
      const packed = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 })
      const text = extractDocxText(base64ToBytes(packed))
      return { id: newId(), kind: 'file', name: f.name, mime, size: f.size ?? 0, text: clipDocText(text), status: 'ready' }
    }
    const text = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.UTF8 })
    return { id: newId(), kind: 'file', name: f.name, mime, size: f.size ?? text.length, text: clipDocText(text), status: 'ready' }
  } catch { return 'error' }
}
