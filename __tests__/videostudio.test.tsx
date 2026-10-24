import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { VideoStudio } from '../src/components/VideoStudio'
import { useVideo } from '../src/store/video'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
const mockModels = jest.fn(), mockQuote = jest.fn(), mockSubmit = jest.fn(), mockJob = jest.fn()
jest.mock('../src/api/api', () => ({
  fetchVideoModels: (...a: unknown[]) => mockModels(...a),
  quoteVideo: (...a: unknown[]) => mockQuote(...a),
  submitVideo: (...a: unknown[]) => mockSubmit(...a),
  fetchVideoJob: (...a: unknown[]) => mockJob(...a),
  videoContentUrl: (id: string) => `http://api/v1/studio-video/jobs/${id}/content`,
  videoHeaders: () => ({ authorization: 'Bearer tok' }),
}))

const wan = { id: 'wan-3.0-video', name: 'Wan 3.0 Video', access: 'payg' as const, durationSeconds: 5, resolution: '720p', textToVideo: true, requiresImage: false, guestTrial: true }
const veo = { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', access: 'payg' as const, durationSeconds: 8, resolution: '720p', textToVideo: false, requiresImage: true, guestTrial: false }

beforeEach(() => {
  useVideo.setState({ models: [], selectedId: '', state: 'idle', quote: null, job: null, busy: false, error: null })
  useSettings.setState({ lang: 'en' })
  mockModels.mockReset(); mockQuote.mockReset(); mockSubmit.mockReset(); mockJob.mockReset()
  mockModels.mockResolvedValue([wan, veo])
  mockQuote.mockResolvedValue({ micros: 40000, token: 'qt', expiresAt: '', durationSeconds: 5, aspect: '16:9' })
})

describe('Video Studio', () => {
  it('lists a video model with its limits and shows the price before anything is made', async () => {
    const r = await render(<VideoStudio visible onClose={() => {}} />)
    await waitFor(() => expect(r.getByText('Wan 3.0 Video')).toBeTruthy())
    expect(r.getByText('5 dtk · 720p · text to video')).toBeTruthy()
    await waitFor(() => expect(r.getByText('about $0.04 for 5 s')).toBeTruthy())
    expect(r.getByTestId('video-start').props.accessibilityState.disabled).toBe(true)   // no prompt yet
  })

  it('starts a clip with the quote token once a prompt is written', async () => {
    mockSubmit.mockResolvedValue({ id: 'j-1', status: 'completed' })
    const r = await render(<VideoStudio visible onClose={() => {}} />)
    await waitFor(() => expect(r.getByText('about $0.04 for 5 s')).toBeTruthy())
    await fireEvent.changeText(r.getByTestId('video-prompt'), 'ombak di pantai saat senja')
    expect(r.getByTestId('video-start').props.accessibilityState.disabled).toBe(false)
    await fireEvent.press(r.getByTestId('video-start'))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    expect(mockSubmit.mock.calls[0][0]).toMatchObject({ model: 'wan-3.0-video', prompt: 'ombak di pantai saat senja', quoteToken: 'qt', aspect: '16:9' })
    expect(useVideo.getState().job).toEqual({ id: 'j-1', status: 'completed' })
  })

  it('a model that needs a picture cannot start without one', async () => {
    const r = await render(<VideoStudio visible onClose={() => {}} />)
    await waitFor(() => expect(r.getByText('Wan 3.0 Video')).toBeTruthy())
    await fireEvent.press(r.getByTestId('video-model'))
    await fireEvent.press(r.getByTestId(`model-${veo.id}`))
    await fireEvent.changeText(r.getByTestId('video-prompt'), 'gerakan kamera pelan')
    expect(r.getByTestId('video-source')).toBeTruthy()
    expect(r.getByTestId('video-start').props.accessibilityState.disabled).toBe(true)
  })

  it('switches the aspect ratio and asks the price again', async () => {
    const r = await render(<VideoStudio visible onClose={() => {}} />)
    await waitFor(() => expect(r.getByText('about $0.04 for 5 s')).toBeTruthy())
    await fireEvent.press(r.getByTestId('video-aspect-9:16'))
    await waitFor(() => expect(mockQuote.mock.calls.at(-1)?.[0]).toMatchObject({ aspect: '9:16' }))
  })
})
