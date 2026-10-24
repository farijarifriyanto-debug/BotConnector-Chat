import './helpers/mocks'
import { configureApi, transcribeAudio } from '../src/api/api'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })

beforeEach(() => { mockFetch.mockReset(); configureApi({ token: () => 'tok', onUnauthorized: () => {} }) })

describe('voice input request', () => {
  it('posts the clip to the transcription route and returns the text', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { text: 'ingatkan saya besok jam tujuh', duration_seconds: 2.4 }))
    const out = await transcribeAudio({ audioBase64: 'QUJD', mime: 'audio/m4a', language: 'id' })
    expect(out).toEqual({ text: 'ingatkan saya besok jam tujuh', durationSeconds: 2.4 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toContain('/v1/audio/transcriptions')
    expect(JSON.parse(String(init.body))).toEqual({ audio_base64: 'QUJD', mime: 'audio/m4a', language: 'id' })
  })

  it('treats an empty transcript as unavailable instead of sending an empty message', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { text: '   ' }))
    await expect(transcribeAudio({ audioBase64: 'QUJD' })).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a refused clip as a chat error', async () => {
    mockFetch.mockResolvedValueOnce(reply(413, { error: { code: 'audio_too_large', message: 'Audio maksimal 25 MB.' } }))
    await expect(transcribeAudio({ audioBase64: 'QUJD' })).rejects.toBeTruthy()
  })
})
