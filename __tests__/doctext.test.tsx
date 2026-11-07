import './helpers/mocks'
import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { ActionSheetIOS } from 'react-native'
import { Composer } from '../src/components/Composer'
import { clipDocText, DOC_TEXT_MAX, isPlainDoc } from '../src/lib/attachments'
import { toApiMessages } from '../src/lib/conv'
import { STRINGS } from '../src/i18n/strings'

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioStream: () => ({ stream: { start: jest.fn(async () => {}), stop: jest.fn(), sampleRate: 16000 }, isStreaming: false }),
}))
jest.mock('expo-file-system', () => ({ readAsStringAsync: jest.fn(), EncodingType: { UTF8: 'utf8' } }))
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }))
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }))
const mockPicker = jest.requireMock('expo-document-picker').getDocumentAsync as jest.Mock
const mockRead = jest.requireMock('expo-file-system').readAsStringAsync as jest.Mock
const { pickLocalDocument: realPick } = jest.requireActual('../src/lib/attachments') as { pickLocalDocument: typeof import('../src/lib/attachments')['pickLocalDocument'] }
const mockLocalPick = jest.fn()
jest.mock('../src/lib/attachments', () => ({ ...jest.requireActual('../src/lib/attachments'), pickLocalDocument: (...a: unknown[]) => mockLocalPick(...a) }))

jest.setTimeout(30000)
const choose = (index: number) => jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(((_o: unknown, cb: (i: number) => void) => cb(index)) as never)
const model = (vision: boolean) => ({ id: 'm', name: 'M', access: 'custom' as const, vision, tools: false, reasoning: false, available: true })

describe('what counts as a readable plain-text document (audit F3)', () => {
  it('txt, md, csv and json are readable; pdf, docx and unknown binaries are not', () => {
    expect(isPlainDoc('notes.txt', 'text/plain')).toBe(true)
    expect(isPlainDoc('catatan.md', 'application/octet-stream')).toBe(true)
    expect(isPlainDoc('tabel.csv', 'text/csv')).toBe(true)
    expect(isPlainDoc('data.json', 'application/json')).toBe(true)
    expect(isPlainDoc('laporan.pdf', 'application/pdf')).toBe(false)
    expect(isPlainDoc('kajian.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false)
    expect(isPlainDoc('app.exe', 'application/octet-stream')).toBe(false)
  })
  it('the extension decides when the picker reports a generic mime', () => {
    expect(isPlainDoc('README', 'application/octet-stream')).toBe(false)
    expect(isPlainDoc('README', 'text/plain')).toBe(true)   // mime text/* without a known extension is still plain text
  })
  it('a long file is clipped to a fixed budget with an honest marker', () => {
    const short = 'halo'
    expect(clipDocText(short)).toBe(short)
    const long = 'x'.repeat(DOC_TEXT_MAX + 500)
    const clipped = clipDocText(long)
    expect(clipped.startsWith('x'.repeat(100))).toBe(true)
    expect(clipped.length).toBeLessThan(DOC_TEXT_MAX + 200)
    expect(clipped).toContain('truncated')
    expect(clipped).toContain(String(DOC_TEXT_MAX))
  })
})

describe('picking a document without any account: text is read on this phone', () => {
  beforeEach(() => { mockPicker.mockReset(); mockRead.mockReset() })
  it('a text file becomes a ready attachment carrying the extracted text, nothing uploaded', async () => {
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'notes.txt', mimeType: 'text/plain', size: 4, uri: 'file:///n.txt' }] })
    mockRead.mockResolvedValueOnce('DATA')
    const a = await realPick()
    expect(a).toMatchObject({ kind: 'file', name: 'notes.txt', mime: 'text/plain', size: 4, text: 'DATA', status: 'ready' })
    expect(mockRead).toHaveBeenCalledWith('file:///n.txt', { encoding: 'utf8' })
    expect(mockRead).toHaveBeenCalledTimes(1)
    expect((a as { sourceUri?: string }).sourceUri).toBeUndefined()
  })
  it('pdf and docx are refused with an honest flag, not uploaded to some server', async () => {
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'laporan.pdf', mimeType: 'application/pdf', size: 9, uri: 'file:///x.pdf' }] })
    expect(await realPick()).toBe('unsupported')
    expect(mockRead).not.toHaveBeenCalled()
  })
  it('a cancel answers null; an unreadable file answers error instead of pretending', async () => {
    mockPicker.mockResolvedValueOnce({ canceled: true })
    expect(await realPick()).toBeNull()
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'notes.txt', mimeType: 'text/plain', size: 4, uri: 'file:///gone.txt' }] })
    mockRead.mockRejectedValueOnce(new Error('gone'))
    expect(await realPick()).toBe('error')
  })
})

describe('the extracted text reaches the model of the conversation', () => {
  it('file text is appended to the message; cloud documents with a fileId are not doubled', () => {
    const localAtt = { kind: 'file' as const, name: 'notes.txt', mime: 'text/plain', size: 3, text: 'HALO' }
    const cloudAtt = { kind: 'file' as const, name: 'laporan.pdf', mime: 'application/pdf', size: 9, fileId: 'file_bc_1', text: 'DOUBLE?', status: 'ready' as const }
    const out = toApiMessages('', [{ id: 'm1', role: 'user' as const, content: 'ringkas ini', createdAt: 1, attachments: [localAtt, cloudAtt] }], false)
    expect(out).toHaveLength(1)
    expect(out[0].content).toContain('ringkas ini')
    expect(out[0].content).toContain('[Attached file: notes.txt]\nHALO')
    expect(out[0].content).not.toContain('DOUBLE')
  })
  it('in vision mode the text rides along with the images inside the text part', () => {
    const photo = { kind: 'image' as const, name: 'f.jpg', mime: 'image/jpeg', size: 5, dataUrl: 'data:image/jpeg;base64,AAAA' }
    const out = toApiMessages('', [{ id: 'm1', role: 'user' as const, content: 'lihat', createdAt: 1, attachments: [photo, { kind: 'file' as const, name: 'notes.txt', mime: 'text/plain', size: 3, text: 'HALO' }] }], true)
    const parts = out[0].content as { type: string; text?: string }[]
    expect(parts[0].type).toBe('text')
    expect(parts[1].type).toBe('image_url')
    expect(parts[0].text).toContain('[Attached file: notes.txt]\nHALO')
  })
})

describe('composer without cloud files offers the on-phone document attach', () => {
  beforeEach(() => { mockLocalPick.mockReset() })
  it('a provider chat (no cloud plan) shows the attach option and refuses unsupported types with a note', async () => {
    mockLocalPick.mockResolvedValueOnce('unsupported')
    let sheetOptions: string[] = []
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(((o: { options: string[] }, cb: (i: number) => void) => { sheetOptions = o.options; cb(2) }) as never)
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} />)
    await fireEvent.press(r.getByTestId('pill-attach'))
    await waitFor(() => expect(r.queryByText(STRINGS.en.docUnsupported)).toBeTruthy())
    expect(sheetOptions).toEqual([STRINGS.en.attachPhoto, STRINGS.en.attachCamera, STRINGS.en.attachFile, STRINGS.en.cancel])
  })
  it('a read failure is surfaced, never swallowed', async () => {
    mockLocalPick.mockResolvedValueOnce('error')
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} />)
    await fireEvent.press(r.getByTestId('pill-attach'))
    await waitFor(() => expect(r.queryByText(STRINGS.en.docReadFail)).toBeTruthy())
  })
  it('a readable file is ready at once and its extracted text rides with the send', async () => {
    mockLocalPick.mockResolvedValueOnce({ id: 'a1', kind: 'file', name: 'notes.txt', mime: 'text/plain', size: 4, text: 'DATA', status: 'ready' })
    const onSend = jest.fn(); choose(2)
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={onSend} onStop={() => {}} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'ringkas')
    await fireEvent.press(r.getByTestId('pill-attach'))
    await waitFor(() => expect(r.getByTestId('att-notes.txt')).toBeTruthy())
    await fireEvent.press(r.getByTestId('send-go'))
    expect(onSend).toHaveBeenCalledWith('ringkas', { web: false, research: false, image: false, think: true }, [{ kind: 'file', name: 'notes.txt', mime: 'text/plain', size: 4, text: 'DATA', status: 'ready' }])
    await act(async () => {})
  })
  it('cloud-available chats keep their two document options unchanged', async () => {
    let sheetOptions: string[] = []
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(((o: { options: string[] }, cb: (i: number) => void) => { sheetOptions = o.options }) as never)
    const r = await render(<Composer busy={false} model={model(false)} webAvailable onSend={() => {}} onStop={() => {}} files={{ available: true }} />)
    await fireEvent.press(r.getByTestId('pill-attach'))
    expect(sheetOptions).toEqual([STRINGS.en.attachPhoto, STRINGS.en.attachCamera, STRINGS.en.attachFile, STRINGS.en.attachFileCloud, STRINGS.en.cancel])
  })
})
