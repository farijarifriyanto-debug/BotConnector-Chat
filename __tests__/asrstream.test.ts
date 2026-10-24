import './helpers/mocks'
import { asrStreamUrl, openAsrStream } from '../src/lib/asrStream'

class FakeSocket {
  static last: FakeSocket | null = null
  url: string; protocols?: string | string[]; options?: { headers?: Record<string, string> }
  readyState = 1; sent: unknown[] = []; closed = false
  onmessage: ((e: { data?: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(url: string, protocols?: string | string[], options?: { headers?: Record<string, string> }) {
    this.url = url; this.protocols = protocols; this.options = options; FakeSocket.last = this
  }
  send(data: unknown) { this.sent.push(data) }
  close() { this.closed = true }
  emit(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }) }
}

beforeEach(() => { FakeSocket.last = null; (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket })

describe('streaming voice contract', () => {
  it('opens the route with the capture rate, the language and the api key', () => {
    expect(asrStreamUrl(16000)).toBe('wss://api.botconnector.id/v1/audio/stream?sample_rate=16000')
    expect(asrStreamUrl(48000, 'id')).toBe('wss://api.botconnector.id/v1/audio/stream?sample_rate=48000&language=id')
    openAsrStream({ token: 'tok', sampleRate: 16000, language: 'id', handlers: { onPartial: () => {}, onFinal: () => {}, onError: () => {} } })
    const socket = FakeSocket.last!
    expect(socket.url).toContain('sample_rate=16000')
    expect(socket.options?.headers?.authorization).toBe('Bearer tok')
  })

  it('passes partial, final and error frames to the caller and sends PCM plus the finish control', () => {
    const onPartial = jest.fn(), onFinal = jest.fn(), onError = jest.fn(), onClose = jest.fn()
    const session = openAsrStream({ token: 'tok', sampleRate: 16000, handlers: { onPartial, onFinal, onError, onClose } })
    const socket = FakeSocket.last!
    socket.emit({ type: 'ready', sample_rate: 16000 })          // ignored by the client
    socket.emit({ type: 'partial', text: 'Halo' })
    socket.emit({ type: 'final', text: 'Halo dunia', bytes: 32000 })
    socket.emit({ type: 'error', code: 'transcription_failed' })
    expect(onPartial).toHaveBeenCalledWith('Halo')
    expect(onFinal).toHaveBeenCalledWith('Halo dunia')
    expect(onError).toHaveBeenCalledWith('transcription_failed')

    session.send(new Uint8Array([1, 2]))
    session.finish()
    expect(socket.sent[0]).toEqual(new Uint8Array([1, 2]))
    expect(socket.sent[1]).toBe(JSON.stringify({ type: 'finish' }))
    socket.onclose!()
    expect(onClose).toHaveBeenCalled()
  })

  it('cancel closes the socket after telling the server to stop', () => {
    const session = openAsrStream({ token: 'tok', sampleRate: 16000, handlers: { onPartial: () => {}, onFinal: () => {}, onError: () => {} } })
    const socket = FakeSocket.last!
    session.cancel()
    expect(socket.sent).toContain(JSON.stringify({ type: 'cancel' }))
    expect(socket.closed).toBe(true)
  })
})
