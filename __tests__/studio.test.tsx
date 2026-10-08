import './helpers/mocks'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ImageStudio, recentShots } from '../src/components/ImageStudio'
import { useChat } from '../src/store/chat'
import type { Conv, Msg } from '../src/lib/types'

jest.setTimeout(30000)
const Studio = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><ImageStudio visible onClose={() => {}} /></SafeAreaProvider>
const mockPick = jest.fn()
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickPhotos: (...a: unknown[]) => mockPick(...a) }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: jest.fn(async () => {}) }))
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///doc/', readAsStringAsync: jest.fn(async () => 'QUJD'), EncodingType: { Base64: 'base64' } }))

const ratioModel = { id: 'img-a', name: 'Img A', access: 'free' as const, sizes: ['auto', '1024x1024', '1536x1024'], refs: false }
const refModel = { id: 'img-b', name: 'Img B', access: 'plan' as const, sizes: ['1024x1024'], refs: true }
const shot = (id: string, at: number, size = '1024x1024'): Msg => ({ id, role: 'assistant', content: '', createdAt: at, attachments: [{ kind: 'image', name: 'image', mime: 'image/png', size: 1, uri: `images/${id}.png` }], image: { prompt: 'kucing ' + id, modelId: 'img-a', model: 'Img A', size } })
const conv = (id: string, messages: Msg[]): Conv => ({ id, title: 't', model: 'm', system: '', web: false, createdAt: 1, updatedAt: 1, messages } as Conv)
const setup = (over: Partial<ReturnType<typeof useChat.getState>> = {}) => {
  const send = jest.fn(async (..._a: unknown[]) => {}), stop = jest.fn(), regenerate = jest.fn(async (..._a: unknown[]) => {}), selectImageModel = jest.fn((id: string) => useChat.setState({ imageModelId: id })), newChat = jest.fn()
  useChat.setState({ imageModels: [ratioModel, refModel], imageModelId: 'img-a', convs: [], activeId: null, draft: conv('d', []), busy: false, send, stop, regenerate, selectImageModel, newChat, ...over } as never)
  return { send, stop, regenerate, selectImageModel, newChat }
}

describe('AI Image Studio', () => {
  beforeEach(() => { mockPick.mockReset() })

  it('lists only what the account has: models, and ratios only when the model offers a choice', async () => {
    setup(); const r = await render(<Studio />)
    expect(r.getByTestId('studio-model-img-a')).toBeTruthy(); expect(r.getByTestId('studio-model-img-b')).toBeTruthy()
    expect(r.getByTestId('ratio-1536x1024')).toBeTruthy(); expect(r.getByTestId('ratio-1024x1024').props.accessibilityState.selected).toBe(true)
    expect(r.queryByTestId('studio-add-ref')).toBeNull(); expect(r.getByTestId('studio-ref-none')).toBeTruthy()   // text-only model: no fake reference button
    await fireEvent.press(r.getByTestId('studio-model-img-b'))
    expect(r.queryByTestId('ratio-1024x1024')).toBeNull()            // a single size is not a choice
    expect(r.getByTestId('studio-add-ref')).toBeTruthy()
  })

  it('create is disabled for an empty prompt; sends one request with the chosen size and no photos for a text-only model', async () => {
    const { send, newChat } = setup(); const r = await render(<Studio />)
    expect(r.getByTestId('studio-create').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(r.getByTestId('studio-prompt'), '  kucing astronot ')
    await fireEvent.press(r.getByTestId('ratio-1536x1024'))
    await fireEvent.press(r.getByTestId('studio-create'))
    expect(send).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledWith('kucing astronot', { web: false, research: false, image: true, size: '1536x1024' }, [])
    expect(newChat).not.toHaveBeenCalled()                           // the open chat is empty: no new chat needed
    expect(r.getByTestId('studio-prompt').props.value).toBe('')
  })

  it('a reference photo travels with the request, and can be removed first', async () => {
    const { send } = setup({ imageModelId: 'img-b' }); mockPick.mockResolvedValue([{ id: 'p1', kind: 'image', name: 'f.jpg', mime: 'image/jpeg', size: 5, dataUrl: 'data:image/jpeg;base64,AAAA' }, { id: 'p2', kind: 'image', name: 'g.jpg', mime: 'image/jpeg', size: 5, dataUrl: 'data:image/jpeg;base64,BBBB' }])
    const r = await render(<Studio />)
    await fireEvent.press(r.getByTestId('studio-add-ref'))
    await waitFor(() => expect(r.getByTestId('ref-remove-p1')).toBeTruthy())
    await fireEvent.press(r.getByTestId('ref-remove-p2'))
    await fireEvent.changeText(r.getByTestId('studio-prompt'), 'jadikan salju')
    await fireEvent.press(r.getByTestId('studio-create'))
    expect(send).toHaveBeenCalledWith('jadikan salju', expect.objectContaining({ image: true, size: '1024x1024' }), [expect.objectContaining({ dataUrl: 'data:image/jpeg;base64,AAAA' })])
    expect(JSON.stringify(send.mock.calls[0][2])).not.toContain('BBBB')
  })

  it('starts a new chat instead of putting a picture into a text conversation', async () => {
    const text: Msg = { id: 'u', role: 'user', content: 'halo', createdAt: 1 }, ans: Msg = { id: 'a', role: 'assistant', content: 'hai', createdAt: 2 }
    const { send, newChat } = setup({ convs: [conv('c1', [text, ans])], activeId: 'c1' })
    const r = await render(<Studio />)
    await fireEvent.changeText(r.getByTestId('studio-prompt'), 'gambar')
    await fireEvent.press(r.getByTestId('studio-create'))
    expect(newChat).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(1)
  })

  it('while a picture is being made it cannot be submitted twice, and can be cancelled', async () => {
    const { send, stop } = setup({ busy: true }); const r = await render(<Studio />)
    await fireEvent.changeText(r.getByTestId('studio-prompt'), 'x')
    expect(r.getByTestId('studio-create').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(r.getByTestId('studio-create')); expect(send).not.toHaveBeenCalled()
    await fireEvent.press(r.getByTestId('studio-cancel')); expect(stop).toHaveBeenCalled()
  })

  it('shows the latest result with its own ratio; actions follow what the system supports', async () => {
    const a = shot('s1', 10), b = shot('s2', 20, '1536x1024')
    const { regenerate } = setup({ convs: [conv('c1', [{ id: 'u', role: 'user', content: 'k', createdAt: 5 }, a, b])], activeId: 'c1' })
    const r = await render(<Studio />)
    expect(r.getByTestId('studio-result').props.style).toMatchObject({ aspectRatio: 1.5 })
    expect(r.getByTestId('studio-edit').props.accessibilityState.disabled).toBe(true)      // img-a cannot start from a photo
    expect(r.getByTestId('studio-regen').props.accessibilityState.disabled).toBe(false)
    await fireEvent.press(r.getByTestId('studio-regen')); expect(regenerate).toHaveBeenCalledTimes(1)
    await fireEvent.press(r.getByTestId('shot-s1'))                                        // an older picture: redoing it would redo the wrong one
    expect(r.getByTestId('studio-result').props.style).toMatchObject({ aspectRatio: 1 })
    expect(r.getByTestId('studio-regen').props.accessibilityState.disabled).toBe(true)
  })

  it('"edit again" turns the picture into the next reference photo when the model supports it', async () => {
    setup({ imageModelId: 'img-b', convs: [conv('c1', [shot('s1', 10)])], activeId: 'c1' })
    const r = await render(<Studio />)
    expect(r.getByTestId('studio-edit').props.accessibilityState.disabled).toBe(false)
    await fireEvent.press(r.getByTestId('studio-edit'))
    await waitFor(() => expect(r.getByTestId(/^ref-remove-ref-/)).toBeTruthy())
  })

  it('has an honest empty state and no pictures from failed requests', async () => {
    setup(); const r = await render(<Studio />)
    expect(r.getByTestId('studio-empty')).toBeTruthy()
    expect(recentShots([conv('c', [{ ...shot('bad', 1), error: 'quota' }])])).toEqual([])
    await act(async () => { useChat.setState({ imageModels: [], imageModelId: '' } as never) })
    expect(r.getByTestId('studio-nomodel')).toBeTruthy()
  })
})
