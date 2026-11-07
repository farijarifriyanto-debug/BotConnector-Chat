import './helpers/mocks'
import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Composer } from '../src/components/Composer'
import { configureEndpoints, transcribeCustomAudio } from '../src/api/custom'
import { wrapPcmAsWav } from '../src/lib/wav'
import { useAuth } from '../src/store/auth'
import { useSettings } from '../src/store/settings'
import { byokAsrAvailable, useProviders } from '../src/store/providers'
import { STRINGS } from '../src/i18n/strings'

const mockAudio = { granted: true, options: null as null | { onBuffer?: (b: { data: ArrayBuffer }) => void } }
const mockStreamApi = { start: jest.fn(async () => {}), stop: jest.fn() }
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioStream: (options: { onBuffer?: (b: { data: ArrayBuffer }) => void }) => { mockAudio.options = options; return { stream: mockStreamApi, isStreaming: false } },
}))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: async () => {}, deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: jest.fn(), pickPhotos: jest.fn(), takePhoto: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock

jest.setTimeout(30000)
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })
const model = { id: 'm', name: 'M', access: 'custom' as const, vision: false, tools: false, reasoning: false, available: true }
const props = { busy: false, model, webAvailable: false, onSend: jest.fn(), onStop: jest.fn(), voice: { available: true } }

const asrProvider = () => useProviders.setState({ providers: [{ id: 'vp1', name: 'VoiceAI', baseUrl: 'https://talk.example/v1', models: [{ id: 'whisper-large-v3', caps: { asr: true } }], updatedAt: 1 }] })

describe('the wav wrapper (audit F2)', () => {
  it('wraps raw PCM16 into a mono RIFF file with the real sizes', () => {
    const wav = wrapPcmAsWav([new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])], 16000)
    const asciiOf = (b: Uint8Array, start: number, len: number): string => Array.from(b.slice(start, start + len)).map(c => String.fromCharCode(c)).join('')
    expect(asciiOf(wav, 0, 4)).toBe('RIFF')
    expect(asciiOf(wav, 8, 4)).toBe('WAVE')
    expect(wav.length).toBe(44 + 8)
    expect(wav[40] | (wav[41] << 8) | (wav[42] << 16) | (wav[43] << 24)).toBe(8)
    expect(wav[24] | (wav[25] << 8) | (wav[26] << 16) | (wav[27] << 24)).toBe(16000)
  })
})

describe('transcribing with the provider key (no BotConnector token anywhere)', () => {
  beforeEach(() => { mockFetch.mockReset(); configureEndpoints(async id => (id === 'vp1' ? { baseUrl: 'https://talk.example/v1', apiKey: 'sk-voice' } : null)) })
  it('posts the wav to {base}/audio/transcriptions with the marked model', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { text: 'halo dunia' }))
    const wav = wrapPcmAsWav([new Uint8Array([1, 2, 3, 4])], 16000)
    expect(await transcribeCustomAudio('vp1', 'whisper-large-v3', wav, 'id')).toEqual({ text: 'halo dunia' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://talk.example/v1/audio/transcriptions')
    expect(init.headers.authorization).toBe('Bearer sk-voice')
    expect(init.headers.authorization).toContain('sk-voice')
    expect(init.body.get('model')).toBe('whisper-large-v3')
    expect(init.body.get('file')).toBeTruthy()
  })
  it('surfaces a rejected key and refuses to invent words', async () => {
    mockFetch.mockResolvedValueOnce(reply(401, { error: { message: 'bad key' } }))
    await expect(transcribeCustomAudio('vp1', 'whisper-large-v3', new Uint8Array(8))).rejects.toMatchObject({ kind: 'badkey' })
    mockFetch.mockResolvedValueOnce(reply(200, {}))
    await expect(transcribeCustomAudio('vp1', 'whisper-large-v3', new Uint8Array(8))).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('a provider model marked as speech-to-text powers the microphone without any account', () => {
  beforeEach(async () => {
    mockFetch.mockReset(); mockStreamApi.start.mockClear(); mockStreamApi.stop.mockClear()
    useSettings.setState({ lang: 'en' as never })
    useAuth.setState({ session: null } as never)
    asrProvider()
    configureEndpoints(async id => (id === 'vp1' ? { baseUrl: 'https://talk.example/v1', apiKey: 'sk-voice' } : null))
    mockFetch.mockResolvedValue(reply(200, { text: 'dunia semua' }))
  })
  afterEach(() => { useProviders.setState({ providers: [] }) })
  it('records into memory, sends the wav to the provider, and lands the words in the draft', async () => {
    const r = await render(<Composer {...props} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'Halo')
    await fireEvent.press(r.getByTestId('pill-voice'))
    await waitFor(() => expect(mockStreamApi.start).toHaveBeenCalled())
    await act(async () => {
      mockAudio.options!.onBuffer!({ data: new Uint8Array([1, 2, 3, 4]).buffer })
      mockAudio.options!.onBuffer!({ data: new Uint8Array([5, 6, 7, 8]).buffer })
    })
    expect(r.getByTestId('voice-recording')).toBeTruthy()
    await fireEvent.press(r.getByTestId('voice-stop'))
    await waitFor(() => { try { expect(r.getByTestId('composer-input').props.value).toBe('Halo dunia semua') } catch { throw new Error('pending') } }, { timeout: 8000 })
    expect(mockFetch.mock.calls[0][0]).toBe('https://talk.example/v1/audio/transcriptions')
    expect(mockFetch.mock.calls[0][1].headers.authorization).toBe('Bearer sk-voice')
    expect(mockFetch.mock.calls[0][1].body.get('model')).toBeTruthy()   // the marked model rides along as the multipart field
  })
  it('a provider without a marked model answers honestly instead of failing silently', async () => {
    useProviders.setState({ providers: [{ id: 'vp1', name: 'VoiceAI', baseUrl: 'https://talk.example/v1', models: [{ id: 'kimi' }], updatedAt: 1 }] })
    const r = await render(<Composer {...props} />)
    await fireEvent.press(r.getByTestId('pill-voice'))
    await waitFor(() => expect(r.queryByText(STRINGS.en.micDenied)).toBeTruthy())
    expect(mockStreamApi.start).not.toHaveBeenCalled()
  })
  it('byokAsrAvailable reflects the marking for the chat screen gate', () => {
    expect(byokAsrAvailable()).toBe(true)
    useProviders.setState({ providers: [{ id: 'vp1', name: 'VoiceAI', baseUrl: 'https://talk.example/v1', models: [{ id: 'kimi' }], updatedAt: 1 }] })
    expect(byokAsrAvailable()).toBe(false)
  })
})
