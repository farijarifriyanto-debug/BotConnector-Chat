import './helpers/mocks'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { insertPhrase, readPhrases } from '../src/lib/phrases'
import { QuickPhrasesSheet } from '../src/components/QuickPhrasesSheet'
import { Composer } from '../src/components/Composer'
import { usePhrases } from '../src/store/phrases'
import { useSettings } from '../src/store/settings'

jest.setTimeout(30000)
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => ({ prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}), uri: null }),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
  setAudioModeAsync: jest.fn(async () => {}),
}))
jest.mock('../src/api/files', () => ({ uploadFile: jest.fn(), fileStatus: jest.fn(), isTerminal: () => true }))
jest.mock('../src/lib/attachments', () => ({ MAX_IMAGES: 4, pickDocument: jest.fn(), pickPhotos: jest.fn(), takePhoto: jest.fn() }))

const model = { id: 'm', name: 'M', access: 'free' as const, vision: false, tools: false, reasoning: false, available: true }
const storage = () => require('expo-sqlite/kv-store').default

beforeEach(() => {
  usePhrases.setState({ phrases: [] })
  useSettings.setState({ lang: 'en' })
})

describe('inserting a quick phrase', () => {
  it('replaces the selection, or appends when there is none', () => {
    expect(insertPhrase('Halo dunia', 'apa kabar', { start: 5, end: 10 })).toEqual({ text: 'Halo apa kabar', caret: 14 })
    expect(insertPhrase('Halo dunia', 'apa kabar', { start: 5, end: 5 })).toEqual({ text: 'Halo apa kabardunia', caret: 14 })
    expect(insertPhrase('Halo', 'apa kabar')).toEqual({ text: 'Haloapa kabar', caret: 13 })
    expect(insertPhrase('Halo ', 'apa kabar')).toEqual({ text: 'Halo apa kabar', caret: 14 })
    expect(insertPhrase('Halo', 'apa kabar', { start: 99, end: 1 })).toEqual({ text: 'Haloapa kabar', caret: 13 })
  })

  it('leaves the draft alone when the phrase is blank', () => {
    expect(insertPhrase('Halo', '   ', { start: 2, end: 2 })).toEqual({ text: 'Halo', caret: 4 })
  })
})

describe('stored quick phrases', () => {
  it('adds, edits, reorders and removes, and keeps only usable rows after a restart', () => {
    const s = () => usePhrases.getState()
    s().add('Sapaan', 'Selamat pagi')
    s().add('Penutup', 'Terima kasih')
    expect(s().phrases.map(p => p.title)).toEqual(['Sapaan', 'Penutup'])
    const [a, b] = s().phrases
    expect(a.id).toBeTruthy()

    s().move(b.id, -1)
    expect(s().phrases.map(p => p.title)).toEqual(['Penutup', 'Sapaan'])
    s().move(b.id, -1)                                             // already first: no change
    expect(s().phrases.map(p => p.title)).toEqual(['Penutup', 'Sapaan'])

    s().update(a.id, { title: 'Salam', content: 'Halo semua' })
    expect(s().phrases.find(p => p.id === a.id)).toMatchObject({ title: 'Salam', content: 'Halo semua' })

    s().remove(b.id)
    expect(s().phrases.map(p => p.title)).toEqual(['Salam'])
    expect(JSON.parse(storage().getItemSync('bc.phrases.v1'))).toHaveLength(1)

    expect(readPhrases(JSON.parse('[{"id":"x","title":"","content":"  "},{"id":"y","content":"ok"}]'))).toEqual([{ id: 'y', title: 'ok', content: 'ok' }])
    expect(readPhrases('nope')).toEqual([])
  })

  it('refuses a row without a title or without content, like the reference app', () => {
    usePhrases.getState().add('  ', 'isi')
    usePhrases.getState().add('Judul', '   ')
    expect(usePhrases.getState().phrases).toEqual([])
  })
})

describe('quick phrase sheet', () => {
  it('shows the empty state, then adds, edits and deletes a phrase', async () => {
    const r = await render(<QuickPhrasesSheet visible onClose={() => {}} />)
    expect(r.getByText('No quick phrases yet.')).toBeTruthy()

    await fireEvent.press(r.getByTestId('qp-add'))
    await fireEvent.changeText(r.getByTestId('qp-title'), 'Sapaan')
    await fireEvent.changeText(r.getByTestId('qp-content'), 'Selamat pagi')
    await fireEvent.press(r.getByTestId('qp-save'))

    await waitFor(() => expect(usePhrases.getState().phrases).toHaveLength(1))
    const id = usePhrases.getState().phrases[0].id
    await waitFor(() => expect(r.getByTestId(`qp-row-${id}`)).toBeTruthy())

    await fireEvent.press(r.getByTestId(`qp-row-${id}`))
    await fireEvent.changeText(r.getByTestId('qp-content'), 'Selamat sore')
    await fireEvent.press(r.getByTestId('qp-save'))
    await waitFor(() => expect(usePhrases.getState().phrases[0].content).toBe('Selamat sore'))

    await fireEvent.press(r.getByTestId(`qp-del-${id}`))
    await waitFor(() => expect(usePhrases.getState().phrases).toEqual([]))
  })

  it('moves a phrase up and down without a drag gesture', async () => {
    usePhrases.setState({ phrases: [{ id: 'p1', title: 'Satu', content: 'one' }, { id: 'p2', title: 'Dua', content: 'two' }] })
    const r = await render(<QuickPhrasesSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('qp-down-p1'))
    expect(usePhrases.getState().phrases.map(p => p.id)).toEqual(['p2', 'p1'])
    await fireEvent.press(r.getByTestId('qp-up-p1'))
    expect(usePhrases.getState().phrases.map(p => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('composer quick phrase button', () => {
  it('is hidden without phrases, then inserts the chosen phrase into the draft', async () => {
    const r = await render(<Composer busy={false} model={model} webAvailable={false} onSend={() => {}} onStop={() => {}} />)
    expect(r.queryByTestId('pill-quick')).toBeNull()

    usePhrases.setState({ phrases: [{ id: 'p1', title: 'Sapaan', content: 'Selamat pagi' }] })
    const c = await render(<Composer busy={false} model={model} webAvailable={false} onSend={() => {}} onStop={() => {}} />)
    await fireEvent.changeText(c.getByTestId('composer-input'), 'Halo')
    await fireEvent.press(c.getByTestId('pill-quick'))
    await fireEvent.press(c.getByTestId('qp-pick-p1'))
    expect(c.getByTestId('composer-input').props.value).toBe('HaloSelamat pagi')
  })
})
