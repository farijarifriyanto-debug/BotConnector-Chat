import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { MessageView } from '../src/components/MessageView'
import { useAuth } from '../src/store/auth'
import { useSettings } from '../src/store/settings'
import type { Msg } from '../src/lib/types'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}) }))

const props = { streaming: false, status: null, isLastAssistant: true, canAct: true, onRegenerate: () => {} }
const source = { title: 'Berita Harga', url: 'https://a.example', id: 'ra1b2c3' }
const answer = (content: string): Msg => ({ id: 'a1', role: 'assistant', content, createdAt: Date.now(), model: 'glm-4.6', sources: [source] })

beforeEach(() => {
  useSettings.setState({ lang: 'en', msgMeta: false })
  useAuth.setState({ account: null })
})

describe('cited answers', () => {
  it('renders [cite:id] as a numbered source pill instead of raw markers', async () => {
    const r = await render(<MessageView msg={answer('Harga naik. [cite:ra1b2c3]')} {...props} />)
    const tree = JSON.stringify(r.toJSON())
    expect(tree).not.toContain('cite:')
    const pill = r.getByLabelText('Berita Harga')
    expect(String(pill.props.children)).toBe(' 1 ')
  })

  it('drops a marker that belongs to no source', async () => {
    const r = await render(<MessageView msg={answer('Halo. [cite:zzzzzz]')} {...props} />)
    const tree = JSON.stringify(r.toJSON())
    expect(tree).not.toContain('cite:')
    expect(tree).not.toContain('zzzzzz')
  })

  it('copies the answer with numbers, not markers', async () => {
    const r = await render(<MessageView msg={answer('Harga naik. [cite:ra1b2c3]')} {...props} />)
    await fireEvent.press(r.getByLabelText('Copy'))
    expect(require('expo-clipboard').setStringAsync).toHaveBeenCalledWith('Harga naik. [1]')
  })
})
