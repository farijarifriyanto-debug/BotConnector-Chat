import './helpers/mocks'
import { ChatError } from '../src/lib/types'
import { audioFormatFor, joinVoiceText, transcribeClip, voiceFailure } from '../src/lib/voice'

describe('joining spoken text to a draft', () => {
  it('adds one space between ordinary words and respects a trailing space', () => {
    expect(joinVoiceText('', 'halo dunia')).toBe('halo dunia')
    expect(joinVoiceText('Halo', 'dunia')).toBe('Halo dunia')
    expect(joinVoiceText('Halo ', 'dunia')).toBe('Halo dunia')
    expect(joinVoiceText('Halo', '')).toBe('Halo')
    expect(joinVoiceText('', '   ')).toBe('')
  })

  it('does not separate a leading punctuation mark or CJK text', () => {
    expect(joinVoiceText('Halo', ', dunia')).toBe('Halo, dunia')
    expect(joinVoiceText('こんにちは', '世界')).toBe('こんにちは世界')
    expect(joinVoiceText('Halo', '世界')).toBe('Halo世界')
  })
})

describe('audio format of a recording', () => {
  it('names the mime and extension the service should receive', () => {
    expect(audioFormatFor('file:///tmp/voice.m4a')).toEqual({ mime: 'audio/m4a', format: 'm4a' })
    expect(audioFormatFor('file:///tmp/voice.wav')).toEqual({ mime: 'audio/wav', format: 'wav' })
    expect(audioFormatFor('file:///tmp/voice.webm')).toEqual({ mime: 'audio/webm', format: 'webm' })
    expect(audioFormatFor('file:///tmp/voice.3gp')).toEqual({ mime: 'audio/3gpp', format: '3gp' })
    expect(audioFormatFor('file:///tmp/voice')).toEqual({ mime: 'audio/m4a', format: 'm4a' })
  })
})

describe('voice failures', () => {
  it('turns service errors into something the composer can say', () => {
    expect(voiceFailure(new ChatError('balance'))).toBe('balance')
    expect(voiceFailure(new ChatError('auth'))).toBe('auth')
    expect(voiceFailure(new ChatError('network'))).toBe('network')
    expect(voiceFailure(new ChatError('capacity'))).toBe('unavailable')
    expect(voiceFailure(new ChatError('aborted'))).toBe('aborted')
    expect(voiceFailure(new Error('Microphone permission denied'))).toBe('mic')
    expect(voiceFailure(new Error('weird'))).toBe('failed')
  })
})

describe('transcribing a recording', () => {
  it('sends the clip as base64 with its format and language, and returns the words', async () => {
    const transcribe = jest.fn(async (_req: { audioBase64: string; mime: string; format: string; language?: string }) => ({ text: '  harga beras naik  ', durationSeconds: 3 }))
    const r = await transcribeClip('file:///tmp/voice.m4a', { language: 'id', deps: { readBase64: async () => 'QUJD', transcribe } })
    expect(transcribe).toHaveBeenCalledWith({ audioBase64: 'QUJD', mime: 'audio/m4a', format: 'm4a', language: 'id' }, undefined)
    expect(r).toEqual({ text: 'harga beras naik', durationSeconds: 3 })
  })

  it('leaves the language out when there is none', async () => {
    const transcribe = jest.fn(async (_req: { audioBase64: string; mime: string; format: string; language?: string }) => ({ text: 'ok', durationSeconds: null }))
    await transcribeClip('file:///tmp/voice.wav', { deps: { readBase64: async () => 'QQ==', transcribe } })
    expect(transcribe.mock.calls[0][0]).toEqual({ audioBase64: 'QQ==', mime: 'audio/wav', format: 'wav' })
  })
})
