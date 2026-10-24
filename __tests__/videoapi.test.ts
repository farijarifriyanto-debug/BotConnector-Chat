import './helpers/mocks'
import { configureApi, fetchVideoJob, fetchVideoModels, quoteVideo, submitVideo } from '../src/api/api'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })

beforeEach(() => { mockFetch.mockReset(); configureApi({ token: () => 'tok', onUnauthorized: () => {} }) })

describe('video catalog and jobs', () => {
  it('maps the catalog to what the picker shows', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { object: 'list', data: [
      { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', botconnector_modality: 'video', botconnector_access: 'payg', duration_seconds: 8, resolution: '720p', supports_text_to_video: false, requires_image: true, guest_trial: false },
      { id: 'wan-3.0-video', name: 'Wan 3.0 Video', botconnector_access: 'payg', duration_seconds: 5, resolution: '720p', supports_text_to_video: true, requires_image: false, guest_trial: true },
    ] }))
    const list = await fetchVideoModels()
    expect(list.map(m => m.id)).toEqual(['veo-3.1-fast-generate-preview', 'wan-3.0-video'])
    expect(list[0]).toMatchObject({ requiresImage: true, textToVideo: false, durationSeconds: 8 })
    expect(list[1]).toMatchObject({ requiresImage: false, guestTrial: true, access: 'payg' })
    expect(String(mockFetch.mock.calls[0][0])).toContain('/v1/studio-video/models')
  })

  it('asks a price and refuses a quote without a token', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { customer_estimate_micros: 40000, quote_token: 'qt', quote_expires_at: '2026-10-24T15:00:00Z', duration_seconds: 5, aspect_ratio: '16:9' }))
    expect(await quoteVideo({ model: 'wan-3.0-video', aspect: '16:9' })).toMatchObject({ micros: 40000, token: 'qt', durationSeconds: 5 })
    mockFetch.mockResolvedValueOnce(reply(200, { customer_estimate_micros: 40000 }))
    await expect(quoteVideo({ model: 'wan-3.0-video', aspect: '16:9' })).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('sends the quote token and an idempotency key with the job', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { job: { id: 'j-1', status: 'submitted' } }))
    expect(await submitVideo({ model: 'wan-3.0-video', prompt: 'ombak di pantai', aspect: '16:9', quoteToken: 'qt', idempotencyKey: 'abc12345' }))
      .toEqual({ id: 'j-1', status: 'submitted' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toContain('/v1/studio-video/jobs')
    expect(init.headers['x-botconnector-media-quote']).toBe('qt')
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'wan-3.0-video', prompt: 'ombak di pantai', idempotency_key: 'abc12345' })
  })

  it('reads the job status and its failure reason', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { job: { id: 'j-1', status: 'failed', error_code: 'provider_timeout' } }))
    expect(await fetchVideoJob('j-1')).toEqual({ id: 'j-1', status: 'failed', error: 'provider_timeout' })
  })
})
