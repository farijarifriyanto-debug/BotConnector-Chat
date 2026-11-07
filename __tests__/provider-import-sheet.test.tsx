import './helpers/mocks'
import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { Camera } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { ProvidersSheet } from '../src/components/ProvidersSheet'
import { useSettings } from '../src/store/settings'
import { useProviders } from '../src/store/providers'
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-camera', () => ({ Camera: { scanFromURLAsync: jest.fn() }, useCameraPermissions: () => [null, jest.fn()], CameraView: 'CameraView' }))
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))
const qr = (value: unknown) => 'ai-provider:v1:' + btoa(JSON.stringify(value))
beforeEach(() => { useSettings.setState({ lang: 'en' }); useProviders.setState({ providers: [] }) })
it('imports a key into the existing editable form without sending or saving it', async () => {
  const add = jest.spyOn(useProviders.getState(), 'add')
  const r = await render(<ProvidersSheet visible onClose={() => {}} />)
  await fireEvent.press(r.getByTestId('provider-paste'))
  await fireEvent.changeText(r.getByTestId('provider-import-text'), qr({ type: 'openai', name: 'My AI', baseUrl: 'https://example.com/v1', apiKey: 'fake-key' }))
  await fireEvent.press(r.getByTestId('provider-import-submit'))
  expect(r.getByTestId('prov-key').props.value).toBe('fake-key')
  expect(r.getByTestId('prov-key').props.secureTextEntry).toBe(true)
  expect(r.getByTestId('prov-url').props.value).toBe('https://example.com/v1')
  expect(add).not.toHaveBeenCalled()
  add.mockRestore()
})
it('rejects invalid QR with a helpful error and retains text entry', async () => {
  const r = await render(<ProvidersSheet visible onClose={() => {}} />)
  await fireEvent.press(r.getByTestId('provider-paste'))
  await fireEvent.changeText(r.getByTestId('provider-import-text'), 'invalid secret payload')
  await fireEvent.press(r.getByTestId('provider-import-submit'))
  expect(r.getByTestId('provider-import-error')).toBeTruthy()
  expect(r.queryByTestId('prov-key')).toBeNull()
})
it('opens manual entry from connection choices', async () => {
  const r = await render(<ProvidersSheet visible onClose={() => {}} />)
  await fireEvent.press(r.getByTestId('provider-manual'))
  expect(r.getByTestId('prov-key')).toBeTruthy()
})
it('clears an imported credential when changing destination preset', async () => {
  const r = await render(<ProvidersSheet visible onClose={() => {}} />)
  await fireEvent.press(r.getByTestId('provider-paste'))
  await fireEvent.changeText(r.getByTestId('provider-import-text'), qr({ type: 'openai', apiKey: 'secret-for-openai' }))
  await fireEvent.press(r.getByTestId('provider-import-submit'))
  await fireEvent.press(r.getByTestId('preset-OpenRouter'))
  expect(r.getByTestId('prov-key').props.value).toBe('')
})
it('ignores a gallery result arriving after the sheet has closed and reopened', async () => {
  let resolve!: (value: unknown) => void
  ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const r = await render(<ProvidersSheet visible onClose={() => {}} />)
  await fireEvent.press(r.getByTestId('provider-gallery'))
  await r.rerender(<ProvidersSheet visible={false} onClose={() => {}} />)
  await r.rerender(<ProvidersSheet visible onClose={() => {}} />)
  await act(async () => { resolve({ canceled: false, assets: [{ uri: 'file:///qr.png' }] }) })
  expect(Camera.scanFromURLAsync).not.toHaveBeenCalled()
  expect(r.queryByTestId('prov-key')).toBeNull()
})
it('reads a gallery QR into the same masked form', async () => {
  ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///qr.png' }] })
  ;(Camera.scanFromURLAsync as jest.Mock).mockResolvedValueOnce([{ data: qr({ type: 'openai', apiKey: 'gallery-fake' }) }])
  const r = await render(<ProvidersSheet visible onClose={() => {}} />)
  await fireEvent.press(r.getByTestId('provider-gallery'))
  expect((await r.findByTestId('prov-key')).props.value).toBe('gallery-fake')
})
