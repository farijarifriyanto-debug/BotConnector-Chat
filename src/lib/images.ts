import * as FileSystem from 'expo-file-system/legacy'
import { newId } from './conv'
import type { Msg } from './types'

// Only the relative path ("images/<id>.png") is stored: the app container's absolute path changes between updates.
const root = () => FileSystem.documentDirectory ?? ''
const extOf = (mime: string) => (/jpe?g/.test(mime) ? 'jpg' : /webp/.test(mime) ? 'webp' : 'png')
const isRel = (p: string) => /^images\/[\w-]+\.(png|jpg|webp)$/.test(p)
/** Where a stored picture lives right now. */
export const imageUri = (rel: string) => (isRel(rel) ? root() + rel : '')

/** Writes a generated picture to the app's documents and returns its relative path. */
export async function saveImage(b64: string, mime: string): Promise<{ uri: string; size: number }> {
  await FileSystem.makeDirectoryAsync(root() + 'images/', { intermediates: true })
  const rel = `images/${newId()}.${extOf(mime)}`
  await FileSystem.writeAsStringAsync(root() + rel, b64, { encoding: FileSystem.EncodingType.Base64 })
  const info = await FileSystem.getInfoAsync(root() + rel)
  return { uri: rel, size: info.exists ? info.size : 0 }
}
/** Pictures that belong to chats being deleted. */
export async function deleteImagesOf(messages: Msg[]): Promise<void> {
  for (const m of messages) for (const a of m.attachments ?? []) if (a.uri && isRel(a.uri)) await FileSystem.deleteAsync(root() + a.uri, { idempotent: true }).catch(() => {})
}
