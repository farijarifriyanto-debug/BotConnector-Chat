import { useCallback, useEffect, useRef, useState } from 'react'
import { fileStatus, isTerminal, uploadFile } from '../api/files'
import { pickDocument, pickPhotos, takePhoto, MAX_IMAGES, type LocalAttachment } from '../lib/attachments'
import type { Attachment } from '../lib/types'

const POLL_MS = 1500, GIVE_UP_MS = 15 * 60_000
/** What is attached to the message being written: photos are ready at once, documents upload and are processed in the background. */
export function useAttachments() {
  const [items, setItems] = useState<LocalAttachment[]>([])
  const aborts = useRef(new Map<string, AbortController>())
  const patch = useCallback((id: string, p: Partial<LocalAttachment>) => setItems(l => l.map(x => (x.id === id ? { ...x, ...p } : x))), [])
  useEffect(() => () => { aborts.current.forEach(a => a.abort()) }, [])

  const track = useCallback(async (a: LocalAttachment) => {
    const ctl = new AbortController(); aborts.current.set(a.id, ctl)
    try {
      const up = await uploadFile({ uri: a.sourceUri!, name: a.name, mime: a.mime, size: a.size }, p => patch(a.id, { progress: p }))
      patch(a.id, { fileId: up.id, status: up.status === 'ready' ? 'ready' : up.status === 'failed' ? 'failed' : 'processing', progress: 1 })
      const t0 = Date.now(); let st = up.status
      while (!isTerminal(st) && !ctl.signal.aborted && Date.now() - t0 < GIVE_UP_MS) {
        await new Promise(r => setTimeout(r, POLL_MS))
        if (ctl.signal.aborted) return
        const f = await fileStatus(up.id, ctl.signal); st = f.status
        patch(a.id, { status: st === 'ready' ? 'ready' : st === 'failed' ? 'failed' : 'processing' })
      }
      if (!isTerminal(st) && !ctl.signal.aborted) patch(a.id, { status: 'failed' })
    } catch { if (!ctl.signal.aborted) patch(a.id, { status: 'failed' }) }
    finally { aborts.current.delete(a.id) }
  }, [patch])

  const photoCount = items.filter(x => x.kind === 'image').length
  const addPhotos = useCallback(async () => { const got = await pickPhotos(MAX_IMAGES - photoCount); if (got.length) setItems(l => [...l, ...got]) }, [photoCount])
  const addCamera = useCallback(async (): Promise<'denied' | 'ok'> => {
    if (photoCount >= MAX_IMAGES) return 'ok'
    const r = await takePhoto(); if (r === 'denied') return 'denied'
    if (r) setItems(l => [...l, r]); return 'ok'
  }, [photoCount])
  const addDocument = useCallback(async () => { const d = await pickDocument(); if (!d) return; setItems(l => [...l, d]); void track(d) }, [track])
  const remove = useCallback((id: string) => { aborts.current.get(id)?.abort(); aborts.current.delete(id); setItems(l => l.filter(x => x.id !== id)) }, [])
  const clear = useCallback(() => { aborts.current.forEach(a => a.abort()); aborts.current.clear(); setItems([]) }, [])
  const ready = items.every(x => x.kind === 'image' || x.status === 'ready')
  /** the persisted form of the attachments (no local file paths or progress) */
  const toMessage = (): Attachment[] => items.map(({ id: _id, sourceUri: _s, progress: _p, ...a }) => a)
  return { items, photoCount, addPhotos, addCamera, addDocument, remove, clear, ready, hasFailed: items.some(x => x.status === 'failed'), toMessage }
}
