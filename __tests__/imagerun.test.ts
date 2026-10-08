import './helpers/mocks'
import { newConv } from '../src/lib/conv'
import { useChat } from '../src/store/chat'

jest.setTimeout(30000)
const mockGen = jest.fn()
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: async () => {}, deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))
jest.mock('../src/lib/images', () => ({ saveImage: async () => ({ uri: 'images/x.png', size: 3 }), deleteImagesOf: async () => {}, imageUri: (r: string) => r }))
jest.mock('../src/api/api', () => ({ ...jest.requireActual('../src/api/api'), generateImage: (...a: unknown[]) => mockGen(...a) }))

const chatModel = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
const photo = { kind: 'image' as const, name: 'f.jpg', mime: 'image/jpeg', size: 5, dataUrl: 'data:image/jpeg;base64,AAAA' }
const start = (im: { refs: boolean; sizes: string[] }) => useChat.setState({ models: [chatModel], modelId: 'm', imageModels: [{ id: 'img', name: 'Img', access: 'free', ...im }], imageModelId: 'img', convs: [], activeId: null, draft: newConv('m'), busy: false, caps: { files: false, web: true } } as never)
const opts = { web: false, research: false, image: true }

describe('picture requests from the store', () => {
  beforeEach(() => { mockGen.mockReset(); mockGen.mockResolvedValue({ b64: 'QUJD', mime: 'image/png' }) })

  it('uses the chosen size only if the model offers it, and sends photos only to models that take them', async () => {
    start({ refs: true, sizes: ['auto', '1024x1024', '1536x1024'] })
    await useChat.getState().send('ubah jadi salju', { ...opts, size: '1536x1024' }, [photo])
    expect(mockGen).toHaveBeenLastCalledWith({ model: 'img', prompt: 'ubah jadi salju', size: '1536x1024', refs: ['data:image/jpeg;base64,AAAA'] }, expect.anything())
    const last = useChat.getState().convs[0].messages.at(-1)!
    expect(last.image).toMatchObject({ size: '1536x1024', prompt: 'ubah jadi salju' }); expect(last.error).toBeUndefined()
    start({ refs: false, sizes: ['auto', '1024x1024'] })
    await useChat.getState().send('x', { ...opts, size: '2048x2048' }, [photo])   // not offered by this model: the default is used, and the photo is not sent
    expect(mockGen).toHaveBeenLastCalledWith({ model: 'img', prompt: 'x', size: '1024x1024', refs: undefined }, expect.anything())
  })

  it('regenerate repeats the same size and charges only because the user asked for it', async () => {
    start({ refs: false, sizes: ['1024x1024', '1024x1536'] })
    await useChat.getState().send('poster', { ...opts, size: '1024x1536' })
    expect(mockGen).toHaveBeenCalledTimes(1)
    await useChat.getState().regenerate({ web: false, research: false })
    expect(mockGen).toHaveBeenCalledTimes(2); expect(mockGen.mock.calls[1][0]).toMatchObject({ size: '1024x1536', prompt: 'poster' })
    expect(useChat.getState().convs[0].messages.filter(m => m.role === 'assistant')).toHaveLength(1)   // replaced, not stacked
  })

  it('a failed request is kept as a retryable picture request, not a text answer', async () => {
    start({ refs: false, sizes: ['1024x1024'] }); mockGen.mockRejectedValueOnce(Object.assign(new Error('q'), { kind: 'quota' }))
    await useChat.getState().send('p', opts)
    const m = useChat.getState().convs[0].messages.at(-1)!
    expect(m.error).toBeTruthy(); expect(m.image).toBeDefined()
    expect(useChat.getState().busy).toBe(false)
  })
})
