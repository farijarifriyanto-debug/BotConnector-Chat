import * as DocumentPicker from 'expo-document-picker'
import * as ImageManipulator from 'expo-image-manipulator'
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
