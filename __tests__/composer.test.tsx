import './helpers/mocks'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { ActionSheetIOS } from 'react-native'
import { Composer } from '../src/components/Composer'
import { STRINGS } from '../src/i18n/strings'

jest.setTimeout(30000)
const mockUpload = jest.fn(), mockStatus = jest.fn(), mockPickDoc = jest.fn(), mockPickPhotos = jest.fn()
jest.mock('../src/api/files', () => ({ uploadFile: (...a: unknown[]) => mockUpload(...a), fileStatus: (...a: unknown[]) => mockStatus(...a), isTerminal: (s: string) => s === 'ready' || s === 'failed' }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: () => mockPickDoc(), pickPhotos: () => mockPickPhotos(), takePhoto: jest.fn() }))
const model = (vision: boolean) => ({ id: 'm', name: 'M', access: 'free' as const, vision, tools: false, reasoning: false, available: true })
const choose = (index: number) => jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(((_o: unknown, cb: (i: number) => void) => cb(index)) as never)

describe('Composer attachments', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('waits for a document to be processed before it can be sent, then sends its metadata', async () => {
    mockPickDoc.mockResolvedValue({ id: 'a1', kind: 'file', name: 'laporan.pdf', mime: 'application/pdf', size: 10, sourceUri: 'file:///x.pdf', status: 'uploading', progress: 0 })
    let finish: () => void = () => {}
    mockUpload.mockResolvedValue({ id: 'file_bc_1', status: 'processing' }); mockStatus.mockImplementation(() => new Promise(r => { finish = () => r({ id: 'file_bc_1', status: 'ready' }) }))
    const onSend = jest.fn(); choose(2)
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={onSend} onStop={() => {}} files={{ available: true }} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'ringkas')
    await fireEvent.press(r.getByTestId('pill-attach'))
    await waitFor(() => expect(r.getByTestId('att-laporan.pdf')).toBeTruthy())
    expect(mockUpload.mock.calls[0][2]).toBe(false)                                          // plain File option: no cloud processing consent
    await waitFor(() => expect(mockStatus).toHaveBeenCalled(), { timeout: 8000 })
    expect(r.getByTestId('send-go').props.accessibilityState.disabled).toBe(true)          // the service is still processing it
    await act(async () => { finish() })
    await waitFor(() => expect(r.getByTestId('send-go').props.accessibilityState.disabled).toBe(false), { timeout: 5000 })
    await fireEvent.press(r.getByTestId('send-go'))
    expect(onSend).toHaveBeenCalledWith('ringkas', { web: false, research: false, image: false, think: true }, [expect.objectContaining({ kind: 'file', name: 'laporan.pdf', fileId: 'file_bc_1', status: 'ready' })])
    expect(JSON.stringify(onSend.mock.calls[0][2])).not.toContain('file:///x.pdf')           // no local path leaves the composer
  })

  it('attach sheet: localized local/cloud document options, and the cloud choice reaches the upload', async () => {
    mockPickDoc.mockResolvedValue({ id: 'a1', kind: 'file', name: 'laporan.pdf', mime: 'application/pdf', size: 10, sourceUri: 'file:///x.pdf', status: 'uploading', progress: 0 })
    mockUpload.mockResolvedValue({ id: 'file_bc_1', status: 'ready' })
    let sheetOptions: string[] = []
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(((o: { options: string[] }, cb: (i: number) => void) => { sheetOptions = o.options; cb(3) }) as never)
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} files={{ available: true }} />)
    await fireEvent.press(r.getByTestId('pill-attach'))
    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    expect(sheetOptions).toEqual([STRINGS.en.attachPhoto, STRINGS.en.attachCamera, STRINGS.en.attachFile, STRINGS.en.attachFileCloud, STRINGS.en.cancel])
    expect(mockUpload.mock.calls[0][2]).toBe(true)                                           // cloud option: explicit nonsensitive consent
  })

  it('keeps send disabled for photos until a model that can see images is chosen', async () => {
    mockPickPhotos.mockResolvedValue([{ id: 'p1', kind: 'image', name: 'f.jpg', mime: 'image/jpeg', size: 5, dataUrl: 'data:image/jpeg;base64,AAAA' }])
    choose(0)
    const blind = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} files={{ available: true }} />)
    await fireEvent.changeText(blind.getByTestId('composer-input'), 'apa ini')
    await fireEvent.press(blind.getByTestId('pill-attach'))
    await waitFor(() => expect(blind.getByTestId('att-f.jpg')).toBeTruthy())
    expect(blind.getByTestId('send-go').props.accessibilityState.disabled).toBe(true)
    const seeing = await render(<Composer busy={false} model={model(true)} webAvailable onSend={() => {}} onStop={() => {}} files={{ available: true }} />)
    await fireEvent.changeText(seeing.getByTestId('composer-input'), 'apa ini')
    await fireEvent.press(seeing.getByTestId('pill-attach'))
    await waitFor(() => expect(seeing.getByTestId('att-f.jpg')).toBeTruthy())
    expect(seeing.getByTestId('send-go').props.accessibilityState.disabled).toBe(false)
  })

  it('has a model button in the action row that opens the model list', async () => {
    const onPickModel = jest.fn()
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} onPickModel={onPickModel} />)
    await fireEvent.press(r.getByTestId('pill-model'))
    expect(onPickModel).toHaveBeenCalledTimes(1)
    expect(r.getByTestId('pill-model').props.accessibilityLabel).toBe('Choose a model: M')
  })

  it('leaves the model button out when the screen does not offer one', async () => {
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} />)
    expect(r.queryByTestId('pill-model')).toBeNull()
  })

  it('offers the reasoning switch only for models that can think, and reports it with the message', async () => {
    const onSend = jest.fn(), onThinkChange = jest.fn()
    const thinking = { ...model(false), reasoning: true }
    const r = await render(<Composer busy={false} model={thinking} webAvailable onSend={onSend} onStop={() => {}} think={false} onThinkChange={onThinkChange} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'halo')
    await fireEvent.press(r.getByTestId('send-go'))
    expect(onSend.mock.calls[0][1]).toMatchObject({ think: false })
    await fireEvent.press(r.getByTestId('pill-think'))
    expect(onThinkChange).toHaveBeenCalledWith(true)
    const plain = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} onThinkChange={onThinkChange} />)
    expect(plain.queryByTestId('pill-think')).toBeNull()
  })

  it('collects the actions that no longer fit under "+"', async () => {
    const r = await render(<Composer busy={false} model={model(false)} webAvailable researchAvailable image={{ available: true, modelName: 'img', onPick: () => {} }} onSend={() => {}} onStop={() => {}} />)
    expect(r.queryByTestId('pill-more')).toBeNull()
    await fireEvent(r.getByTestId('composer-actions'), 'layout', { nativeEvent: { layout: { width: 210, height: 40 } } })
    expect(r.getByTestId('pill-more')).toBeTruthy()
    expect(r.queryByTestId('pill-image')).toBeNull()
    await fireEvent.press(r.getByTestId('pill-more'))
    await fireEvent.press(r.getByTestId('more-image'))
    await fireEvent.press(r.getByTestId('pill-more'))
    expect(r.getByTestId('more-image').props.accessibilityState.selected).toBe(true)
  })

  it('waits its turn instead of dropping a message typed while answering', async () => {
    const onSend = jest.fn(), onQueue = jest.fn()
    const r = await render(<Composer busy model={model(false)} webAvailable onSend={onSend} onStop={() => {}} onQueue={onQueue} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'pertanyaan berikutnya')
    expect(r.queryByTestId('send-go')).toBeNull()          // while answering, the round button is the stop button
    await fireEvent(r.getByTestId('composer-input'), 'submitEditing')
    expect(onQueue).toHaveBeenCalledWith('pertanyaan berikutnya', expect.objectContaining({ web: false }), [])
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows what is waiting and lets the person drop it', async () => {
    const onCancelQueue = jest.fn()
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} queued={{ text: 'pertanyaan berikutnya' }} onCancelQueue={onCancelQueue} />)
    expect(r.getByTestId('composer-queued')).toBeTruthy()
    await fireEvent.press(r.getByTestId('queued-cancel'))
    expect(onCancelQueue).toHaveBeenCalled()
  })

  it('keeps the web button visible when search is not available, leading to the settings', async () => {
    const onWebUnavailable = jest.fn()
    const r = await render(<Composer busy={false} model={model(false)} webAvailable={false} onSend={() => {}} onStop={() => {}} onWebUnavailable={onWebUnavailable} />)
    const globe = r.getByTestId('pill-web')
    expect(globe.props.accessibilityState.selected).toBe(false)
    await fireEvent.press(globe)
    expect(onWebUnavailable).toHaveBeenCalledTimes(1)
  })

  it('hides the web button only when the screen offers nothing to do about it', async () => {
    const r = await render(<Composer busy={false} model={model(false)} webAvailable={false} onSend={() => {}} onStop={() => {}} />)
    expect(r.queryByTestId('pill-web')).toBeNull()
  })
})