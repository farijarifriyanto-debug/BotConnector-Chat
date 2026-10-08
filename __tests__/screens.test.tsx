import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SettingsSheet } from '../src/components/SettingsSheet'
import { Sidebar } from '../src/components/Sidebar'
import { LoginScreen } from '../src/screens/LoginScreen'
import { OnboardingScreen, seenOnboarding } from '../src/screens/OnboardingScreen'
import { useAuth } from '../src/store/auth'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.setTimeout(30000)   // first render in a cold jest cache is slow
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{ui}</SafeAreaProvider>
const conv = (id: string, title: string, updatedAt: number) => ({ id, title, updatedAt, createdAt: updatedAt, model: 'm', messages: [{ id: 'x' + id, role: 'user' as const, content: title, createdAt: updatedAt }] })

describe('screens', () => {
  it('login button starts the browser sign-in', async () => {
    const login = jest.fn(); useAuth.setState({ login, busy: false, error: null } as never)
    const r = await render(<LoginScreen />)
    await fireEvent.press(r.getByTestId('login-button'))
    expect(login).toHaveBeenCalled()
  })

  it('delete account stays disabled until the exact phrase and a password are given', async () => {
    const del = jest.fn(async () => ({ ok: false as const, reason: 'wrong_password' as const })); useAuth.setState({ deleteAccount: del, account: null } as never)
    const r = await render(<SettingsSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('delete-account'))
    await fireEvent.changeText(r.getByTestId('delete-password'), 'secret')
    await fireEvent.changeText(r.getByTestId('delete-phrase'), 'hapus')
    expect(r.getByTestId('delete-confirm').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(r.getByTestId('delete-phrase'), 'HAPUS AKUN')
    await fireEvent.press(r.getByTestId('delete-confirm'))
    expect(del).toHaveBeenCalledWith('secret', 'HAPUS AKUN')
    expect(await r.findByTestId('delete-error')).toBeTruthy()
  })

  it('sidebar lists chats and filters by search', async () => {
    const onOpen = jest.fn()
    const r = await render(wrap(<Sidebar open convs={[conv('a', 'Resep nasi goreng', Date.now()), conv('b', 'Harga beras', Date.now())] as never} activeId={null} onClose={() => {}} onNew={() => {}} onOpen={onOpen} onDelete={() => {}} onSettings={() => {}} onPals={() => {}} />))
    expect(r.getByText('Resep nasi goreng')).toBeTruthy()
    await fireEvent.changeText(r.getByPlaceholderText('Search chats'), 'beras')
    expect(r.queryByText('Resep nasi goreng')).toBeNull()
    await fireEvent.press(r.getByTestId('conv-b'))
    expect(onOpen).toHaveBeenCalledWith('b')
  })

  it('onboarding is shown once: the last page marks it as seen', async () => {
    const done = jest.fn(); expect(seenOnboarding()).toBe(false)
    const r = await render(wrap(<OnboardingScreen onDone={done} />))
    await fireEvent.press(r.getByTestId('ob-next')); await fireEvent.press(r.getByTestId('ob-next'))
    expect(done).not.toHaveBeenCalled()
    await fireEvent.press(r.getByTestId('ob-skip'))
    expect(done).toHaveBeenCalledTimes(1); expect(seenOnboarding()).toBe(true)
  })
})
