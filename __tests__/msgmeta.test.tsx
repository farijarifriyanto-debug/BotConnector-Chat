import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { MessageView, secondsLabel, stamp } from '../src/components/MessageView'
import { useAuth } from '../src/store/auth'
import { useSettings } from '../src/store/settings'
import type { Msg } from '../src/lib/types'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}) }))

const AT = new Date(2026, 9, 24, 14, 30, 7).getTime()
const base = { id: 'a1', convId: 'c1', createdAt: AT } as const
const user: Msg = { ...base, id: 'u1', role: 'user', content: 'ringkas laporan ini' }
const answer: Msg = { ...base, role: 'assistant', content: 'Berikut ringkasannya.', model: 'glm-4.6' }
const props = { streaming: false, status: null, isLastAssistant: true, canAct: true, onRegenerate: () => {} }
const ACCOUNT = { user_id: 'x', email: 'farij@example.com', display_name: 'Farij' as string | null, plan: 'free', available_micros: 0, has_payg: false, plan_models: [], cloud: { limit_tokens_24h: 0, used_tokens_24h: 0, remaining_tokens_24h: 0 } }

beforeEach(() => {
  useSettings.setState({ msgMeta: true, lang: 'en' })
  useAuth.setState({ account: null })
})

describe('message meta', () => {
  it('stamps a message exactly like the reference app (yyyy-MM-dd HH:mm:ss)', () => {
    expect(stamp(AT)).toBe('2026-10-24 14:30:07')
    expect(stamp(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('2026-01-02 03:04:05')
  })

  it('writes one-decimal seconds with the language decimal mark', () => {
    expect(secondsLabel(5200, 'en')).toBe('5.2')
    expect(secondsLabel(5200, 'id')).toBe('5,2')
    expect(secondsLabel(0, 'en')).toBe('0.0')
  })

  it('shows the signed-in name, avatar initial and time above the user message', async () => {
    useAuth.setState({ account: ACCOUNT })
    const r = await render(<MessageView msg={user} {...props} />)
    expect(r.getByTestId('meta-user')).toBeTruthy()
    expect(r.getByText('Farij')).toBeTruthy()
    expect(r.getByText('F')).toBeTruthy()
    expect(r.getByTestId('msg-time').props.children).toBe(stamp(AT))
    expect(r.queryByTestId('meta-assistant')).toBeNull()
  })

  it('falls back to the email local part and then to "You"', async () => {
    useAuth.setState({ account: { ...ACCOUNT, display_name: null } })
    const byEmail = await render(<MessageView msg={user} {...props} />)
    expect(byEmail.getByText('farij')).toBeTruthy()
    useAuth.setState({ account: null })
    const guest = await render(<MessageView msg={user} {...props} />)
    expect(guest.getByText('You')).toBeTruthy()
    expect(guest.getByText('Y')).toBeTruthy()
  })

  it('names the answer after the model that produced it', async () => {
    const r = await render(<MessageView msg={answer} {...props} />)
    expect(r.getByTestId('meta-assistant')).toBeTruthy()
    expect(r.getByTestId('assistant-name').props.children).toBe('glm-4.6')
    expect(r.getByTestId('avatar-assistant')).toBeTruthy()
    expect(r.getByTestId('msg-time').props.children).toBe(stamp(AT))
  })

  it('hides the whole row when the setting is off', async () => {
    useSettings.setState({ msgMeta: false })
    const a = await render(<MessageView msg={user} {...props} />)
    expect(a.queryByTestId('meta-user')).toBeNull()
    expect(a.queryByTestId('msg-time')).toBeNull()
    const b = await render(<MessageView msg={answer} {...props} />)
    expect(b.queryByTestId('meta-assistant')).toBeNull()
  })

  it('shows how long the answer took when the store recorded it', async () => {
    const r = await render(<MessageView msg={{ ...answer, ms: 1840 }} {...props} />)
    expect(r.getByTestId('msg-latency').props.children).toBe('1.8s')
    useSettings.setState({ lang: 'id' })
    const id = await render(<MessageView msg={{ ...answer, ms: 1840 }} {...props} />)
    expect(id.getByTestId('msg-latency').props.children).toBe('1,8 dtk')
  })
})

describe('reasoning card', () => {
  it('counts while the model is still thinking and keeps the text open', async () => {
    const r = await render(<MessageView msg={{ ...answer, content: '', reasoning: 'User minta ringkasan.', reasoningAt: Date.now() }} {...props} streaming />)
    expect(r.getByTestId('reasoning-label').props.children.startsWith('Thinking… ')).toBe(true)
    expect(r.getByText('User minta ringkasan.')).toBeTruthy()
  })

  it('collapses to "Thought for 5.2s" once the answer starts, and opens on tap', async () => {
    const done: Msg = { ...answer, reasoning: 'User minta ringkasan.', reasoningAt: AT, reasoningMs: 5200 }
    const r = await render(<MessageView msg={done} {...props} />)
    expect(r.getByTestId('reasoning-label').props.children).toBe('Thought for 5.2s')
    expect(r.queryByText('User minta ringkasan.')).toBeNull()
    await fireEvent.press(r.getByTestId('reasoning-toggle'))
    expect(r.getByText('User minta ringkasan.')).toBeTruthy()
    await fireEvent.press(r.getByTestId('reasoning-toggle'))
    expect(r.queryByText('User minta ringkasan.')).toBeNull()
  })

  it('localises the collapsed label', async () => {
    useSettings.setState({ lang: 'id' })
    const done: Msg = { ...answer, reasoning: 'x', reasoningAt: AT, reasoningMs: 5200 }
    const r = await render(<MessageView msg={done} {...props} />)
    expect(r.getByTestId('reasoning-label').props.children).toBe('Berpikir 5,2 dtk')
  })
})
