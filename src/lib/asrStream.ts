import { API_BASE } from '../api/config'

/** Where the streaming microphone route lives, with the real capture rate of the device. */
export function asrStreamUrl(sampleRate: number, language?: string): string {
  const ws = API_BASE.replace(/^http/i, 'ws')
  const params = new URLSearchParams({ sample_rate: String(Math.round(sampleRate || 16000)) })
  if (language) params.set('language', language)
  return `${ws}/v1/audio/stream?${params.toString()}`
}

export interface AsrHandlers {
  onPartial(text: string): void
  onFinal(text: string): void
  onError(code: string): void
  onClose?(): void
}
export interface AsrSession {
  /** Raw mono PCM16, little-endian, at the rate announced in the url. */
  send(pcm: Uint8Array): void
  /** Ends the turn: the server flushes the last window and answers with `final`. */
  finish(): void
  cancel(): void
}

/**
 * The streaming voice contract from the backend: PCM16 up, `partial` text while speaking,
 * `final` at the end, `error` with a code. The api key travels as a Bearer header, like the
 * one-shot transcription route.
 */
export function openAsrStream(opts: { token: string; sampleRate: number; language?: string; handlers: AsrHandlers }): AsrSession {
  const h = opts.handlers
  const socket = new (WebSocket as unknown as { new (url: string, protocols?: string | string[], options?: { headers?: Record<string, string> }): WebSocket })(
    asrStreamUrl(opts.sampleRate, opts.language), undefined, { headers: { authorization: `Bearer ${opts.token}` } },
  )
  socket.onmessage = event => {
    let message: { type?: string; text?: string; code?: string } | null = null
    try { message = JSON.parse(String((event as { data?: unknown }).data)) } catch { return }
    if (!message) return
    if (message.type === 'partial') h.onPartial(String(message.text ?? ''))
    else if (message.type === 'final') h.onFinal(String(message.text ?? ''))
    else if (message.type === 'error') h.onError(String(message.code ?? 'failed'))
  }
  socket.onerror = () => h.onError('failed')
  socket.onclose = () => h.onClose?.()
  return {
    send(pcm) { if (socket.readyState === 1) socket.send(pcm) },
    finish() { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'finish' })) },
    cancel() { try { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'cancel' })) } finally { socket.close() } },
  }
}
