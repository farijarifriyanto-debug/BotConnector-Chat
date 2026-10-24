import './helpers/mocks'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { computeStats, rangeFor } from '../src/lib/stats'
import { StatsSheet } from '../src/components/StatsSheet'
import { useChat } from '../src/store/chat'
import { useSettings } from '../src/store/settings'
import { newConv } from '../src/lib/conv'

jest.setTimeout(30000)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('../src/db/convs', () => ({ listConvs: async () => [], putConv: async () => {}, deleteConv: async () => {}, clearConvs: async () => {}, getConv: async () => null }))

const NOW = new Date(2026, 9, 24, 12, 0, 0)   // 24 Oct 2026, local time
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0).getTime()
const chat = (id: string, title: string, created: number, messages: { content: string; role: 'user' | 'assistant'; model?: string; at: number }[]) => ({
  ...newConv('m'), id, title, createdAt: created, updatedAt: created,
  messages: messages.map((m, i) => ({ id: `${id}-${i}`, role: m.role, content: m.content, createdAt: m.at, model: m.model })),
})
const CONVS = [
  chat('c1', 'Harga beras', at(2026, 10, 20), [
    { role: 'user', content: 'harga beras?', at: at(2026, 10, 20, 10) },
    { role: 'assistant', content: 'Naik.', model: 'GLM 4.6', at: at(2026, 10, 20, 10) },
  ]),
  chat('c2', 'Liburan', at(2026, 9, 1), [{ role: 'user', content: 'kemana?', at: at(2026, 9, 1, 9) }]),
  { ...newConv('m'), id: 'p1', title: 'Project', kind: 'project' as const, createdAt: at(2026, 10, 20), messages: [] },   // not a chat
]

describe('stats ranges', () => {
  it('uses local midnight boundaries like the reference app', () => {
    expect(rangeFor('30d', NOW)).toEqual({ start: at(2026, 9, 25, 0), end: at(2026, 10, 25, 0) })
    expect(rangeFor('lastMonth', NOW)).toEqual({ start: at(2026, 9, 1, 0), end: at(2026, 10, 1, 0) })
    expect(rangeFor('lastQuarter', NOW)).toEqual({ start: at(2026, 7, 1, 0), end: at(2026, 10, 1, 0) })
    expect(rangeFor('all', NOW)).toEqual({})
  })
})

describe('numbers from the chats on this device', () => {
  it('counts chats, messages and answers in range, and ranks models and topics', () => {
    const all = computeStats(CONVS as never, 'all', NOW)
    expect(all).toMatchObject({ conversations: 2, messages: 3, answers: 1 })
    expect(all.models).toEqual([{ label: 'GLM 4.6', value: 1 }])
    expect(all.topics.map(t => [t.label, t.value])).toEqual([['Harga beras', 2], ['Liburan', 1]])

    const month = computeStats(CONVS as never, '30d', NOW)
    expect(month).toMatchObject({ conversations: 1, messages: 2, answers: 1 })
  })

  it('draws 365 heatmap days and the selected trend range', () => {
    const all = computeStats(CONVS as never, 'all', NOW)
    expect(all.heatmap).toHaveLength(365)
    expect(all.heatmap.at(-1)).toEqual({ day: '2026-10-24', count: 0 })
    expect(all.heatmap.find(d => d.day === '2026-10-20')).toEqual({ day: '2026-10-20', count: 2 })
    expect(all.trend).toHaveLength(30)                      // all time shows the last 30 days, like the reference
    expect(all.trend.at(-5)).toEqual({ day: '2026-10-20', count: 2 })

    const month = computeStats(CONVS as never, 'lastMonth', NOW)
    expect(month.trend).toHaveLength(30)                    // September has 30 days
    expect(month.trend[0]).toEqual({ day: '2026-09-01', count: 1 })
  })
})

describe('statistics sheet', () => {
  beforeEach(() => { useSettings.setState({ lang: 'en' }); useChat.setState({ convs: CONVS as never }) })

  it('shows the totals and follows the range picker', async () => {
    const r = await render(<StatsSheet visible onClose={() => {}} now={NOW} />)
    expect(r.getByTestId('st-conv').props.children).toBe('2')
    expect(r.getByTestId('st-msg').props.children).toBe('3')
    expect(r.getByTestId('st-answers').props.children).toBe('1')
    expect(r.getByTestId('st-heat')).toBeTruthy()
    expect(r.getByTestId('st-model-GLM 4.6')).toBeTruthy()

    await fireEvent.press(r.getByTestId('st-range-30d'))
    expect(r.getByTestId('st-conv').props.children).toBe('1')
    expect(r.getByTestId('st-msg').props.children).toBe('2')
  })
})
