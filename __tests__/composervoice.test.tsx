import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Composer } from '../src/components/Composer'
import { ChatError } from '../src/lib/types'
import { STRINGS } from '../src/i18n/strings'

jest.setTimeout(30000)

const mockVoice = { granted: true, recording: false, uri: 'file:///tmp/voice.m4a' as string | null, error: null as unknown }
const mockRecorder = { prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}) }
const mockTranscribe = jest.fn()
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a' } },
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ isRecording: mockVoice.recording }),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: mockVoice.granted })),
  setAudioModeAsync: jest.fn(async () => {}),
}))
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn(async () => 'QUJD') }))
jest.mock('../src/api/api', () => ({ transcribeAudio: (...a: unknown[]) => mockTranscribe(...a) }))
jest.mock('../src/api/files', () => ({ uploadFile: jest.fn(), fileStatus: jest.fn(), isTerminal: () => true }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: jest.fn(), pickPhotos: jest.fn(), takePhoto: jest.fn() }))

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
const props = { busy: false, model, webAvailable: false, onSend: jest.fn(), onStop: jest.fn(), voice: { available: true } }

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(mockRecorder, 'uri', { value: mockVoice.uri, configurable: true, writable: true })
  mockVoice.granted = true; mockVoice.recording = false
  mockTranscribe.mockResolvedValue({ text: 'harga beras naik', durationSeconds: 2 })
  require('../src/store/settings').useSettings.setState({ lang: 'en' })
})

async function startVoice(r: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(r.getByTestId('pill-voice'))
  await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled())
}

describe('voice input', () => {
  it('records, shows the recording row, and puts the words into the draft', async () => {
    const r = await render(<Composer {...props} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'Halo')
    await startVoice(r)
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled()
    expect(r.getByTestId('voice-recording')).toBeTruthy()

    await fireEvent.press(r.getByTestId('voice-stop'))
    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledWith({ audioBase64: 'QUJD', mime: 'audio/m4a', format: 'm4a', language: 'en' }, undefined))
    await waitFor(() => expect(r.getByTestId('composer-input').props.value).toBe('Halo harga beras naik'))
    expect(r.queryByTestId('voice-recording')).toBeNull()
  })

  it('cancels without transcribing and leaves the draft alone', async () => {
    const r = await render(<Composer {...props} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'Halo')
    await startVoice(r)
    await fireEvent.press(r.getByTestId('voice-cancel'))
    expect(mockTranscribe).not.toHaveBeenCalled()
    expect(r.getByTestId('composer-input').props.value).toBe('Halo')
  })

  it('says so when the microphone is not allowed', async () => {
    mockVoice.granted = false
    const r = await render(<Composer {...props} />)
    await fireEvent.press(r.getByTestId('pill-voice'))
    await waitFor(() => expect(r.getByText(STRINGS.en.micDenied)).toBeTruthy())
    expect(mockRecorder.record).not.toHaveBeenCalled()
  })

  it('says so when nothing was heard, and when the service fails', async () => {
    const r = await render(<Composer {...props} />)
    mockTranscribe.mockResolvedValueOnce({ text: '   ', durationSeconds: 0 })
    await startVoice(r)
    await fireEvent.press(r.getByTestId('voice-stop'))
    await waitFor(() => expect(r.getByText(STRINGS.en.micNoSpeech)).toBeTruthy())

    mockVoice.recording = false
    mockTranscribe.mockRejectedValueOnce(new ChatError('unavailable'))
    await startVoice(r)
    await fireEvent.press(r.getByTestId('voice-stop'))
    await waitFor(() => expect(r.getByText(STRINGS.en.micFail)).toBeTruthy())
  })

  it('sends the words when send is pressed while recording', async () => {
    const r = await render(<Composer {...props} />)
    await startVoice(r)
    await fireEvent.press(r.getByTestId('send-go'))
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('harga beras naik', { web: false, research: false, image: false, think: true }, []))
  })
})
