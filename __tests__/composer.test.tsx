import './helpers/mocks'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { ActionSheetIOS } from 'react-native'
import { Composer } from '../src/components/Composer'

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
    await waitFor(() => expect(mockStatus).toHaveBeenCalled(), { timeout: 8000 })
    expect(r.getByTestId('send-go').props.accessibilityState.disabled).toBe(true)          // the service is still processing it
    await act(async () => { finish() })
    await waitFor(() => expect(r.getByTestId('send-go').props.accessibilityState.disabled).toBe(false), { timeout: 5000 })
    await fireEvent.press(r.getByTestId('send-go'))
    expect(onSend).toHaveBeenCalledWith('ringkas', { web: false, research: false, image: false }, [expect.objectContaining({ kind: 'file', name: 'laporan.pdf', fileId: 'file_bc_1', status: 'ready' })])
    expect(JSON.stringify(onSend.mock.calls[0][2])).not.toContain('file:///x.pdf')           // no local path leaves the composer
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
})
