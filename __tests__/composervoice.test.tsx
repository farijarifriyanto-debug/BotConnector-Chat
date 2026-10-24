import './helpers/mocks'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Composer } from '../src/components/Composer'
import { useAuth } from '../src/store/auth'
import { useSettings } from '../src/store/settings'
import { STRINGS } from '../src/i18n/strings'

jest.setTimeout(30000)

const mockAudio = { granted: true, sampleRate: 16000, options: null as null | { onBuffer?: (b: { data: ArrayBuffer }) => void } }
const mockStreamApi = { start: jest.fn(async () => {}), stop: jest.fn() }
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: mockAudio.granted })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioStream: (options: { onBuffer?: (b: { data: ArrayBuffer }) => void }) => { mockAudio.options = options; return { stream: mockStreamApi, isStreaming: false } },
}))
jest.mock('../src/api/files', () => ({ ...jest.requireActual('../src/api/files'), uploadFile: jest.fn(), fileStatus: jest.fn(), isTerminal: () => true }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: jest.fn(), pickPhotos: jest.fn(), takePhoto: jest.fn() }))

class FakeSocket {
  static last: FakeSocket | null = null
  url: string; options?: { headers?: Record<string, string> }
  readyState = 1; sent: unknown[] = []; closed = false
  onmessage: ((e: { data?: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(url: string, _protocols?: unknown, options?: { headers?: Record<string, string> }) { this.url = url; this.options = options; FakeSocket.last = this }
  send(data: unknown) { this.sent.push(data) }
  close() { this.closed = true }
  emit(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }) }
}

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
const props = { busy: false, model, webAvailable: false, onSend: jest.fn(), onStop: jest.fn(), voice: { available: true } }

beforeEach(() => {
  jest.clearAllMocks()
  mockAudio.granted = true; mockAudio.sampleRate = 16000; mockAudio.options = null
  FakeSocket.last = null
  ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket
  useSettings.setState({ lang: 'en' })
  useAuth.setState({ session: { accessToken: 'tok' } } as never)
})

async function startVoice(r: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(r.getByTestId('pill-voice'))
  await waitFor(() => expect(mockStreamApi.start).toHaveBeenCalled())
  await waitFor(() => expect(FakeSocket.last).toBeTruthy())
  return FakeSocket.last!
}

describe('streaming voice input', () => {
  it('opens the stream with the token, sends PCM, and shows the partial words in the draft', async () => {
    const r = await render(<Composer {...props} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'Halo')
    const socket = await startVoice(r)
    expect(socket.url).toContain('sample_rate=16000')
    expect(socket.options?.headers?.authorization).toBe('Bearer tok')
    expect(r.getByTestId('voice-recording')).toBeTruthy()

    mockAudio.options!.onBuffer!({ data: new Uint8Array([1, 2]).buffer })
    expect(socket.sent[0]).toEqual(new Uint8Array([1, 2]))

    await act(async () => { socket.emit({ type: 'partial', text: 'dunia' }) })
    await waitFor(() => expect(r.getByTestId('composer-input').props.value).toBe('Halo dunia'))
    await fireEvent.press(r.getByTestId('voice-cancel'))
  })

  it('stops, asks for the final words, and keeps them after the draft', async () => {
    const r = await render(<Composer {...props} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'Halo')
    const socket = await startVoice(r)
    await act(async () => { socket.emit({ type: 'partial', text: 'dun' }) })
    await fireEvent.press(r.getByTestId('voice-stop'))
    expect(socket.sent).toContain(JSON.stringify({ type: 'finish' }))
    expect(mockStreamApi.stop).toHaveBeenCalled()
    await act(async () => { socket.emit({ type: 'final', text: 'dunia semua' }) })
    await waitFor(() => expect(r.getByTestId('composer-input').props.value).toBe('Halo dunia semua'))
    expect(r.queryByTestId('voice-recording')).toBeNull()
  })

  it('cancel tells the server, closes, and puts the draft back', async () => {
    const r = await render(<Composer {...props} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'Halo')
    const socket = await startVoice(r)
    await act(async () => { socket.emit({ type: 'partial', text: 'dunia' }) })
    await waitFor(() => expect(r.getByTestId('composer-input').props.value).toBe('Halo dunia'))
    await fireEvent.press(r.getByTestId('voice-cancel'))
    expect(socket.sent).toContain(JSON.stringify({ type: 'cancel' }))
    expect(socket.closed).toBe(true)
    expect(r.getByTestId('composer-input').props.value).toBe('Halo')
  })

  it('says so when the microphone is not allowed, and when the service fails', async () => {
    mockAudio.granted = false
    const r = await render(<Composer {...props} />)
    await fireEvent.press(r.getByTestId('pill-voice'))
    await waitFor(() => expect(r.getByText(STRINGS.en.micDenied)).toBeTruthy())
    expect(mockStreamApi.start).not.toHaveBeenCalled()

    mockAudio.granted = true
    const socket = await startVoice(r)
    await act(async () => { socket.emit({ type: 'error', code: 'transcription_failed' }) })
    await waitFor(() => expect(r.getByText(STRINGS.en.micFail)).toBeTruthy())
    await fireEvent.press(r.getByTestId('voice-cancel'))
  })

  it('sends the final words when send is pressed while recording', async () => {
    const r = await render(<Composer {...props} />)
    const socket = await startVoice(r)
    await fireEvent.press(r.getByTestId('send-go'))
    expect(socket.sent).toContain(JSON.stringify({ type: 'finish' }))
    await act(async () => { socket.emit({ type: 'final', text: 'kirim ini' }) })
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('kirim ini', { web: false, research: false, image: false, think: true }, []))
  })
})
