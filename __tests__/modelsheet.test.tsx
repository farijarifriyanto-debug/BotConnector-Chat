import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { LaptopSheet } from '../src/components/LaptopSheet'
import { LocalModelsSheet } from '../src/components/LocalModelsSheet'
import { ModelSheet } from '../src/components/ModelSheet'
import { Sidebar } from '../src/components/Sidebar'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///doc/', EncodingType: { Base64: 'base64' }, getFreeDiskStorageAsync: async () => 1e12, makeDirectoryAsync: async () => {}, deleteAsync: async () => {}, createDownloadResumable: jest.fn() }))
jest.mock('../src/laptop/api', () => ({ configureLaptop: jest.fn(), createPairCode: jest.fn(), revokeDevice: jest.fn(), laptopId: (d: string, r: string, m: string) => `laptop:${d}:${r}:${m}`, listDevices: jest.fn(async () => []), listModels: jest.fn(async () => []) }))
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{ui}</SafeAreaProvider>
const m = (id: string, name: string, access: 'free' | 'plan' | 'payg' | 'local', extra = {}) => ({ id, name, access, vision: false, tools: false, reasoning: false, available: true, ...extra })
const models = [m('g', 'Gemini 2.5 Flash Lite', 'free', { context: 1_000_000, tools: true }), m('c', 'Claude Sonnet 5.5', 'plan', { reasoning: true }), m('p', 'Kimi K3', 'payg', { available: false, reason: 'no_payg_balance' }), m('l', 'Qwen3 0.6B', 'local')]
const img = [{ id: 'flux', name: 'Flux Free', access: 'free' as const, sizes: ['1024x1024'], refs: false }]

describe('model picker', () => {
  it('searches, filters, and says so when nothing matches', async () => {
    const onSelect = jest.fn(), r = await render(<ModelSheet visible models={models} selected="g" onSelect={onSelect} onClose={() => {}} />)
    expect(r.getByTestId('model-g').props.accessibilityState.selected).toBe(true)
    await fireEvent.changeText(r.getByTestId('model-search'), 'claude')
    expect(r.queryByTestId('model-g')).toBeNull(); expect(r.getByTestId('model-c')).toBeTruthy()
    await fireEvent.changeText(r.getByTestId('model-search'), 'zzz'); expect(r.getByTestId('model-empty')).toBeTruthy()
    await fireEvent.changeText(r.getByTestId('model-search'), ''); await fireEvent.press(r.getByTestId('filter-local'))
    expect(r.getByTestId('model-l')).toBeTruthy(); expect(r.queryByTestId('model-c')).toBeNull()
    expect(r.queryByTestId('filter-image')).toBeNull()        // no picture models on this account: no empty chip
  })
  it('a model that needs balance is shown with the reason and cannot be picked', async () => {
    const onSelect = jest.fn(), r = await render(<ModelSheet visible models={models} selected="g" onSelect={onSelect} onClose={() => {}} />)
    expect(r.getByTestId('model-p').props.accessibilityState.disabled).toBe(true); await fireEvent.press(r.getByTestId('model-p')); expect(onSelect).not.toHaveBeenCalled()
    await fireEvent.press(r.getByTestId('model-c')); expect(onSelect).toHaveBeenCalledWith('c')
  })
  it('picture models appear under Image and open the Studio instead of becoming the chat model', async () => {
    const onSelect = jest.fn(), onImg = jest.fn(), r = await render(<ModelSheet visible models={models} selected="g" onSelect={onSelect} onClose={() => {}} imageModels={img} selectedImage="flux" onSelectImage={onImg} />)
    await fireEvent.press(r.getByTestId('filter-image'))
    expect(r.queryByTestId('model-g')).toBeNull(); await fireEvent.press(r.getByTestId('model-flux'))
    expect(onImg).toHaveBeenCalledWith('flux'); expect(onSelect).not.toHaveBeenCalled()
  })
  it('shows loading and a retry for a failed list', async () => {
    const retry = jest.fn(), a = await render(<ModelSheet visible models={[]} selected="" onSelect={() => {}} onClose={() => {}} state="loading" />)
    expect(a.getByTestId('models-loading')).toBeTruthy()
    const b = await render(<ModelSheet visible models={[]} selected="" onSelect={() => {}} onClose={() => {}} state="error" onRetry={retry} />)
    await fireEvent.press(b.getByTestId('model-retry')); expect(retry).toHaveBeenCalled()
  })
})

describe('other screens', () => {
  it('sidebar offers the Studio only when the account has picture models', async () => {
    const base = { open: true, convs: [], activeId: null, onClose: () => {}, onNew: () => {}, onOpen: () => {}, onDelete: () => {}, onSettings: () => {}, onPals: () => {} }
    const without = await render(wrap(<Sidebar {...base} />)); expect(without.queryByTestId('sidebar-studio')).toBeNull()
    const onStudio = jest.fn(), withIt = await render(wrap(<Sidebar {...base} onStudio={onStudio} />))
    await fireEvent.press(withIt.getByTestId('sidebar-studio')); expect(onStudio).toHaveBeenCalled()
  })
  it('local models: tabs switch the list, an empty Installed tab explains itself', async () => {
    const r = await render(<LocalModelsSheet visible onClose={() => {}} />)
    expect(r.getByText('Qwen3 0.6B')).toBeTruthy()
    await fireEvent.press(r.getByTestId('loc-tab-inst')); expect(r.queryByText('Qwen3 0.6B')).toBeNull(); expect(r.getByTestId('loc-none')).toBeTruthy()
    await fireEvent.press(r.getByTestId('loc-tab-rec')); await fireEvent.changeText(r.getByTestId('loc-filter'), 'llama')
    expect(r.getByText('Llama 3.2 1B Instruct')).toBeTruthy(); expect(r.queryByText('Qwen3 0.6B')).toBeNull()
  })
  it('laptop page shows the three steps and an empty state before any device is paired', async () => {
    const r = await render(<LaptopSheet visible onClose={() => {}} />)
    expect(r.getByTestId('laptop-steps')).toBeTruthy(); expect(r.getByTestId('laptop-pair')).toBeTruthy()
    expect(await r.findByTestId('laptop-empty')).toBeTruthy()
  })
})
