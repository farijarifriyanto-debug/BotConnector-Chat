import './helpers/mocks'
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SettingsSheet } from '../src/components/SettingsSheet'
import { base64ToBytes, bytesToBase64 } from '../src/lib/bytes'
import { newConv } from '../src/lib/conv'
import { useChat } from '../src/store/chat'
import { configureEndpoints, customId, type Endpoint } from '../src/api/custom'
import { useProviders } from '../src/store/providers'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 1, getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: async () => {}, deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/lib/images', () => ({ saveImage: async () => ({ uri: 'images/x.png', size: 3 }), deleteImagesOf: async () => {}, imageUri: (r: string) => r }))
const mockGen = jest.fn()
jest.mock('../src/api/custom', () => ({ ...jest.requireActual('../src/api/custom'), generateCustomImage: (...a: unknown[]) => mockGen(...a) }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const { generateCustomImage: realGenerate } = jest.requireActual('../src/api/custom') as { generateCustomImage: typeof import('../src/api/custom')['generateCustomImage'] }

jest.setTimeout(30000)
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status < 400, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body })
const ep: Endpoint = { baseUrl: 'https://img.example/v1', apiKey: 'sk-img' }

describe('the BYOK image adapter (audit F1, Kelivo openai_images pattern)', () => {
  beforeEach(() => { mockFetch.mockReset(); mockGen.mockReset(); configureEndpoints(async id => (id === 'p1' ? ep : null)) })
  it('posts {base}/images/generations with the provider key and the raw model id', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [{ b64_json: 'QUJD' }] }))
    expect(await realGenerate({ model: 'custom:p1:my-image', prompt: 'poster kucing', size: '1024x1536' })).toEqual({ b64: 'QUJD', mime: 'image/png' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://img.example/v1/images/generations')
    expect(init.headers.authorization).toBe('Bearer sk-img')
    expect(JSON.parse(init.body)).toEqual({ model: 'my-image', prompt: 'poster kucing', n: 1, size: '1024x1536' })
  })
  it('downloads a url answer instead of a base64 one', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { data: [{ url: 'https://img.example/pic' }] }))
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/jpeg' : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })
    const g = await realGenerate({ model: 'custom:p1:m', prompt: 'x', size: '1024x1024' })
    expect(g.mime).toBe('image/jpeg')
    expect(g.b64).toBe(bytesToBase64(new Uint8Array([1, 2, 3])))
    expect(base64ToBytes(g.b64)[0]).toBe(1)
    expect(mockFetch.mock.calls[1][0]).toBe('https://img.example/pic')
    expect(mockFetch.mock.calls[1][1]?.headers?.authorization).toBeUndefined()   // the image link needs no provider key
  })
  it('reports a rejected key honestly and refuses to invent a picture', async () => {
    mockFetch.mockResolvedValueOnce(reply(401, { error: { message: 'bad key' } }))
    await expect(realGenerate({ model: 'custom:p1:m', prompt: 'x', size: '1024x1024' })).rejects.toMatchObject({ kind: 'badkey' })
    mockFetch.mockResolvedValueOnce(reply(200, { data: [] }))
    await expect(realGenerate({ model: 'custom:p1:m', prompt: 'x', size: '1024x1024' })).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('a provider model marked as image-capable reaches the Studio and runs without any cloud account', () => {
  const chatModel = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
  beforeEach(() => {
    mockFetch.mockClear(); mockGen.mockResolvedValue({ b64: 'QUJD', mime: 'image/png' })
    useProviders.setState({ providers: [{ id: 'p1', name: 'ImgAI', baseUrl: 'https://img.example/v1', models: [{ id: 'my-image', caps: { image: true } }], updatedAt: 1 }] })
    useChat.setState({ models: [chatModel], modelId: 'm', imageModels: [{ id: 'cloud-img', name: 'Cloud Img', access: 'free', sizes: ['1024x1024'], refs: false }], imageModelId: 'cloud-img', convs: [], activeId: null, draft: newConv('m'), busy: false, caps: { files: false, web: true } } as never)
  })
  afterEach(() => { useProviders.setState({ providers: [] }) })
  it('syncCustom merges the marked model into the picture list with honest sizes and no photo editing', () => {
    useChat.getState().syncCustom()
    const im = useChat.getState().imageModels.find(x => x.id === customId('p1', 'my-image'))
    expect(im).toEqual({ id: customId('p1', 'my-image'), name: 'my-image', access: 'custom', sizes: ['1024x1024', '1536x1024', '1024x1536'], refs: false })
  })
  it('an unmarked model never shows up, and a revoked marking disappears after sync', () => {
    useChat.getState().syncCustom()
    useProviders.setState({ providers: [{ id: 'p1', name: 'ImgAI', baseUrl: 'https://img.example/v1', models: [{ id: 'my-image', caps: { tools: true } }], updatedAt: 1 }] })
    useChat.getState().syncCustom()
    expect(useChat.getState().imageModels.filter(x => x.id.startsWith('custom:'))).toEqual([])
  })
  it('a picture request runs through the provider, saving the generated file locally', async () => {
    useChat.getState().syncCustom()
    useChat.getState().selectImageModel(customId('p1', 'my-image'))
    await useChat.getState().send('poster', { web: false, research: false, image: true, size: '1024x1024' })
    expect(mockGen).toHaveBeenCalledWith({ model: customId('p1', 'my-image'), prompt: 'poster', size: '1024x1024' }, expect.anything())
    const last = useChat.getState().convs[0].messages.at(-1)!
    expect(last.image).toMatchObject({ prompt: 'poster' })
    expect(last.attachments?.[0].uri).toBe('images/x.png')
    expect(mockFetch).not.toHaveBeenCalled()   // nothing went to BotConnector Cloud
  })
})

describe('marking the image capability in the editor', () => {
  const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{ui}</SafeAreaProvider>
  it('the toggle persists for an OpenAI-compatible provider model', async () => {
    useProviders.setState({ providers: [{ id: 'p1', name: 'ImgAI', baseUrl: 'https://img.example/v1', models: [{ id: 'my-image' }], updatedAt: 1 }] })
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    await fireEvent.press(r.getByTestId('open-caps'))
    expect(r.queryByTestId('cap-image-p1-my-image')).toBeTruthy()
    await fireEvent.press(r.getByTestId('cap-image-p1-my-image'))
    expect(useProviders.getState().providers[0].models[0].caps).toEqual({ image: true })
  })
  it('Anthropic-native providers have no image marking to click: the transport has no picture endpoint', async () => {
    useProviders.setState({ providers: [{ id: 'a1', kind: 'anthropic', name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', models: [{ id: 'claude-x' }], updatedAt: 1 }] })
    const r = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    await fireEvent.press(r.getByTestId('open-caps'))
    expect(r.queryByTestId('cap-image-a1-claude-x')).toBeNull()
  })
})
