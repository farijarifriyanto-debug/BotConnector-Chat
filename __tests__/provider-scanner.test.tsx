import './helpers/mocks'
import React from 'react'
import { AppState } from 'react-native'
import { render, fireEvent, act } from '@testing-library/react-native'
import { ProviderQrScanner } from '../src/components/ProviderQrScanner'
import { useSettings } from '../src/store/settings'
const mockRequest = jest.fn()
const mockGetPermission = jest.fn(async () => ({ granted: true }))
let mockPermission = { granted: true, canAskAgain: true }
jest.mock('expo-camera', () => ({ useCameraPermissions: () => [mockPermission, mockRequest, mockGetPermission], CameraView: 'CameraView' }))
beforeEach(() => { AppState.currentState = 'active'; mockPermission = { granted: true, canAskAgain: true }; mockRequest.mockClear(); useSettings.setState({ lang: 'en' }) })
it('consumes only one camera callback and stops the preview', async () => {
  const scan = jest.fn(), r = await render(<ProviderQrScanner onScan={scan} onCancel={() => {}} />)
  const camera = r.getByTestId('provider-camera')
  await fireEvent(camera, 'barcodeScanned', { data: 'configuration' })
  await fireEvent(camera, 'barcodeScanned', { data: 'configuration' })
  expect(scan).toHaveBeenCalledTimes(1)
  expect(r.queryByTestId('provider-camera')).toBeNull()
})
it('does not mount camera when permission is denied and lets the user leave', async () => {
  mockPermission = { granted: false, canAskAgain: false }
  const cancel = jest.fn(), r = await render(<ProviderQrScanner onScan={() => {}} onCancel={cancel} />)
  expect(r.queryByTestId('provider-camera')).toBeNull()
  expect(r.getByText('Open device settings')).toBeTruthy()
  await fireEvent.press(r.getByTestId('qr-cancel'))
  expect(cancel).toHaveBeenCalledTimes(1)
})
it('refreshes camera permission when returning from device settings', async () => {
  let change!: (state: 'active' | 'background') => void
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => { change = fn; return { remove: jest.fn() } })
  mockPermission = { granted: false, canAskAgain: false }; mockGetPermission.mockClear()
  const r = await render(<ProviderQrScanner onScan={() => {}} onCancel={() => {}} />)
  await act(async () => { change('background') })
  await act(async () => { change('active') })
  expect(mockGetPermission).toHaveBeenCalledTimes(1)
  await r.unmount(); listener.mockRestore()
})
