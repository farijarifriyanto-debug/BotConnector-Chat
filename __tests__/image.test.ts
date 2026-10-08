import './helpers/mocks'
import { classify, configureApi, fetchImageModels, generateImage } from '../src/api/api'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })

describe('image generation', () => {
  beforeEach(() => { mockFetch.mockReset(); configureApi({ token: () => 'tok', onUnauthorized: () => {} }) })
  it('maps quota and plan codes to errors the UI can explain', () => {
    expect(classify(429, 'image_quota_reached').kind).toBe('quota'); expect(classify(403, 'free_daily_budget_exhausted').kind).toBe('quota'); expect(classify(403, 'image_plan_required').kind).toBe('plan')
  })
  it('lists only image models, with sizes and access', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [{ id: 'img-a', name: 'Img A', botconnector_modality: 'image', botconnector_access: 'free', botconnector_sizes: ['auto', '1024x1024'] }, { id: 'tts-1', botconnector_modality: 'audio' }] }))
    expect(await fetchImageModels()).toEqual([{ id: 'img-a', name: 'Img A', access: 'free', sizes: ['auto', '1024x1024'], refs: false }])
  })
  it('returns the picture and what is left of today\'s quota', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [{ b64_json: 'QUJD' }], botconnector: { mime_type: 'image/webp', image_quota: { remaining: 7 } } }))
    expect(await generateImage({ model: 'img-a', prompt: 'kucing' })).toEqual({ b64: 'QUJD', mime: 'image/webp', left: 7 })
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ model: 'img-a', prompt: 'kucing', n: 1, size: '1024x1024' })
  })
  it('sends reference photos only when asked to, in the field the server reads', async () => {
    mockFetch.mockResolvedValue(reply(200, { data: [{ b64_json: 'QUJD' }] }))
    await generateImage({ model: 'img-a', prompt: 'p', size: '1536x1024', refs: ['data:image/png;base64,AAAA'] })
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ n: 1, size: '1536x1024', inputs: { referenceImages: ['data:image/png;base64,AAAA'] } })
    await generateImage({ model: 'img-a', prompt: 'p', refs: [] })
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).not.toHaveProperty('inputs')
  })
  it('surfaces a used-up quota and an empty answer', async () => {
    mockFetch.mockResolvedValueOnce(reply(429, { error: { code: 'image_quota_reached' } }))
    await expect(generateImage({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'quota' })
    mockFetch.mockResolvedValueOnce(reply(200, { data: [] }))
    await expect(generateImage({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
