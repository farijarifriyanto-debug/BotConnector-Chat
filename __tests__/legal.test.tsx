import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Linking } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { legalUrl } from '../src/lib/links'
import { LoginScreen } from '../src/screens/LoginScreen'
import { SettingsSheet } from '../src/components/SettingsSheet'
import { useAuth } from '../src/store/auth'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{ui}</SafeAreaProvider>

describe('privacy and contact links', () => {
  it('point at the pages that exist on the website, in Indonesian or English', () => {
    expect(legalUrl('privacy', 'id')).toBe('https://botconnector.id/id/privacy'); expect(legalUrl('privacy', 'en')).toBe('https://botconnector.id/privacy')
    expect(legalUrl('terms', 'id')).toBe('https://botconnector.id/id/terms'); expect(legalUrl('terms', 'ja')).toBe('https://botconnector.id/terms')   // other languages read the English page
    expect(legalUrl('support', 'id')).toBe('https://botconnector.id/support'); expect(legalUrl('support', 'en')).toBe('https://botconnector.id/support')   // /id/support does not exist
  })
  it('are reachable before sign-in and, without an account, from Settings', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    useSettings.setState({ lang: 'id' } as never)
    const login = await render(wrap(<LoginScreen />))
    await fireEvent.press(login.getByTestId('login-privacy')); expect(open).toHaveBeenLastCalledWith('https://botconnector.id/id/privacy')
    await fireEvent.press(login.getByTestId('login-terms')); expect(open).toHaveBeenLastCalledWith('https://botconnector.id/id/terms')
    useAuth.setState({ status: 'guest' } as never)
    const settings = await render(wrap(<SettingsSheet visible onClose={() => {}} />))
    await fireEvent.press(settings.getByTestId('legal-support')); expect(open).toHaveBeenLastCalledWith('https://botconnector.id/support')
    await fireEvent.press(settings.getByTestId('legal-privacy')); expect(open).toHaveBeenLastCalledWith('https://botconnector.id/id/privacy')
    open.mockRestore(); useSettings.setState({ lang: 'en' } as never)
  })
})
