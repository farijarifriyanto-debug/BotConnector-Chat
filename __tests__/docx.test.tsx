import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { ActionSheetIOS } from 'react-native'
import { zipSync } from 'fflate'
import { Composer } from '../src/components/Composer'
import { extractDocxText, pickLocalDocument } from '../src/lib/attachments'
import { useProviders } from '../src/store/providers'

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-file-system', () => ({ readAsStringAsync: jest.fn(), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }))
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }))
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }))
const mockPicker = jest.requireMock('expo-document-picker').getDocumentAsync as jest.Mock
const mockRead = jest.requireMock('expo-file-system').readAsStringAsync as jest.Mock
const mockAudio = { granted: true, options: null as null | { onBuffer?: (b: { data: ArrayBuffer }) => void } }
const mockStreamApi = { start: jest.fn(async () => {}), stop: jest.fn() }
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioStream: (options: { onBuffer?: (b: { data: ArrayBuffer }) => void }) => { mockAudio.options = options; return { stream: mockStreamApi, isStreaming: false } },
}))

jest.setTimeout(30000)
const b64 = (bytes: Uint8Array): string => { let s = ''; for (const c of bytes) s += String.fromCharCode(c); return btoa(s) }

describe('reading a DOCX on this phone without any account (audit F3)', () => {
  it('joins paragraphs with newlines, strips every tag, and decodes entities', () => {
    const docx = zipSync({
      '[Content_Types].xml': new TextEncoder().encode('<Types/>'),
      'word/document.xml': new TextEncoder().encode(
        '<w:document><w:body>' +
        '<w:p><w:r><w:t>Pendahuluan &amp; latar</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t xml:space="preserve">Kedua &lt;hal&gt; berbeda</w:t></w:r></w:p>' +
        '</w:body></w:document>'),
    })
    const text = extractDocxText(docx)
    expect(text.split('\n')).toEqual(['Pendahuluan & latar', 'Kedua <hal> berbeda'])
  })
  it('a picked .docx becomes a ready attachment with the extracted text, nothing uploaded', async () => {
    const docx = zipSync({
      'word/document.xml': new TextEncoder().encode('<w:document><w:body><w:p><w:r><w:t>Halaman satu</w:t></w:r></w:p></w:body></w:document>'),
      'word/styles.xml': new TextEncoder().encode('<s/>'),
    })
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'kajian.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: docx.length, uri: 'file:///k.docx' }] })
    mockRead.mockResolvedValueOnce(b64(docx))
    const a = await pickLocalDocument()
    expect(a).toMatchObject({ kind: 'file', name: 'kajian.docx', text: 'Halaman satu', status: 'ready' })
    expect(mockRead).toHaveBeenCalledWith('file:///k.docx', { encoding: 'base64' })
  })
  it('a corrupt docx answers error honestly', async () => {
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'rusak.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 9, uri: 'file:///r.docx' }] })
    mockRead.mockResolvedValueOnce(b64(new TextEncoder().encode('definitely not a zip file at all')))
    expect(await pickLocalDocument()).toBe('error')
  })
  it('pdf stays honestly unsupported pending a real parser decision', async () => {
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'laporan.pdf', mimeType: 'application/pdf', size: 9, uri: 'file:///x.pdf' }] })
    expect(await pickLocalDocument()).toBe('unsupported')
  })
  it('the composer rides docx text along with the send', async () => {
    const docx = zipSync({ 'word/document.xml': new TextEncoder().encode('<w:document><w:body><w:p><w:r><w:t>Halaman satu</w:t></w:r></w:p></w:body></w:document>') })
    mockPicker.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'kajian.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: docx.length, uri: 'file:///k.docx' }] })
    mockRead.mockResolvedValueOnce(b64(docx))
    const onSend = jest.fn()
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(((_o: unknown, cb: (i: number) => void) => cb(2)) as never)
    const r = await render(<Composer busy={false} model={{ id: 'm', name: 'M', access: 'custom' as const, vision: false, tools: false, reasoning: false, available: true }} webAvailable onSend={onSend} onStop={() => {}} />)
    await fireEvent.changeText(r.getByTestId('composer-input'), 'ringkas')
    await fireEvent.press(r.getByTestId('pill-attach'))
    await waitFor(() => expect(r.getByTestId('att-kajian.docx')).toBeTruthy())
    await fireEvent.press(r.getByTestId('send-go'))
    expect(onSend.mock.calls[0][2][0]).toMatchObject({ name: 'kajian.docx', text: 'Halaman satu' })
    useProviders.setState({ providers: [] })
  })
})
