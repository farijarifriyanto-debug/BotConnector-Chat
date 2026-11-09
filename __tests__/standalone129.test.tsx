import './helpers/mocks'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ProvidersSheet } from '../src/components/ProvidersSheet'
import { LANGUAGES } from '../src/i18n/langs'
import { STRINGS, errorText } from '../src/i18n/strings'
import { providerFailure } from '../src/api/api'
import { ChatError } from '../src/lib/types'
import { useProviders } from '../src/store/providers'
import { useSettings } from '../src/store/settings'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-camera', () => ({ Camera: { scanFromURLAsync: jest.fn() }, useCameraPermissions: () => [null, jest.fn()], CameraView: 'CameraView' }))
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))

// 2.1.0 resubmission (Guideline 3.1.1, rejection of 2.0.0): nothing in the app may sell, price or point to
// BotConnector credits. Video Studio was the last paid-feature surface, and "top up in the Workspace" was
// what a BYOK provider's 402 showed the person.

const fs = require('fs'), path = require('path')
const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) => {
  const p = path.join(dir, e.name)
  return e.isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
})

describe('no paid video surface', () => {
  it('has no Video Studio component, store or route', () => {
    const root: string = path.join(process.cwd(), 'src')
    expect(fs.existsSync(path.join(root, 'components', 'VideoStudio.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'store', 'video.ts'))).toBe(false)
    const offenders = sources(root).filter((f: string) => /studio-video|VideoStudio|sidebar-video|vidTitle/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders.map((f: string) => path.relative(root, f))).toEqual([])
  })
})

describe('a provider that says "no balance"', () => {
  it('maps a 402 to a message about the provider account, never to BotConnector', () => {
    for (const lang of ['en', 'id'] as const) {
      const text = errorText(lang, providerFailure(402))
      expect(text).not.toMatch(/workspace|payg|botconnector|paket|plan/i)
      expect(text).toMatch(/provider|penyedia/i)
    }
  })
  it('leaves no stale translation of the old copy in other languages', () => {
    const stale = LANGUAGES.filter(l => l.code !== 'en' && l.code !== 'id' && STRINGS[l.code] && 'errBalance' in (STRINGS[l.code] as object)).map(l => l.code)
    expect(stale).toEqual([])
  })
})

describe('agreement before the first provider is saved (Guideline 5.1.2(i))', () => {
  const openForm = async () => {
    const r = await render(<ProvidersSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('provider-manual'))
    await fireEvent.changeText(r.getByTestId('prov-name'), 'My AI')
    await fireEvent.changeText(r.getByTestId('prov-url'), 'https://example.com/v1')
    await fireEvent.changeText(r.getByTestId('prov-key'), 'fake-key')
    return r
  }
  beforeEach(() => { useSettings.setState({ lang: 'en', dataConsent: false }); useProviders.setState({ providers: [] }) })

  it('keeps Save off until the person agrees, then remembers the agreement after saving', async () => {
    const add = jest.spyOn(useProviders.getState(), 'add').mockResolvedValue({ ok: true })
    const r = await openForm()
    expect(r.getByTestId('prov-data-consent').props.accessibilityState.checked).toBe(false)
    expect(r.getByTestId('prov-save').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(r.getByTestId('prov-save'))
    expect(add).not.toHaveBeenCalled()

    await fireEvent.press(r.getByTestId('prov-data-consent'))
    expect(r.getByTestId('prov-data-consent').props.accessibilityState.checked).toBe(true)
    expect(r.getByTestId('prov-save').props.accessibilityState.disabled).toBeFalsy()
    expect(useSettings.getState().dataConsent).toBe(false)   // ticking alone records nothing
    await fireEvent.press(r.getByTestId('prov-save'))
    expect(add).toHaveBeenCalledTimes(1)
    expect(useSettings.getState().dataConsent).toBe(true)
    add.mockRestore()
  })

  it('says what leaves the device and to whom', async () => {
    const r = await openForm()
    const text = (STRINGS.en as Record<string, string>).dataConsent
    expect(text).toMatch(/messages/i)
    expect(text).toMatch(/sent from this device/i)
    expect(text).toMatch(/privacy policy/i)
    expect(r.getByText(text)).toBeTruthy()
  })

  it('does not ask again once agreed', async () => {
    useSettings.setState({ dataConsent: true })
    const r = await openForm()
    expect(r.queryByTestId('prov-data-consent')).toBeNull()
    expect(r.getByTestId('prov-save').props.accessibilityState.disabled).toBeFalsy()
  })
})
