import './helpers/mocks'

jest.mock('expo-sqlite/kv-store', () => {
  const mem = new Map<string, string>()
  return { __esModule: true, default: { getItemSync: (k: string) => mem.get(k) ?? null, setItemSync: (k: string, v: string) => void mem.set(k, v), removeItemSync: (k: string) => void mem.delete(k) } }
})

jest.mock('../src/laptop/api', () => ({ listDevices: jest.fn() }))
jest.mock('../src/agent/api', () => ({
  AGENT_IDLE_TIMEOUT_MS: 120_000,
  sessions: jest.fn(),
  workspaces: jest.fn(),
  start: jest.fn(),
  session: jest.fn(),
  prompt: jest.fn(),
  approve: jest.fn(),
  cancel: jest.fn(),
  stream: jest.fn(),
}))

import { act, fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { AgentSheet } from '../src/components/AgentSheet'
import { configureAgentStore, useAgent } from '../src/agent/store'
import * as agentApi from '../src/agent/api'
import * as laptopApi from '../src/laptop/api'

const listDevices = laptopApi.listDevices as jest.Mock
const sessions = agentApi.sessions as jest.Mock
const workspaces = agentApi.workspaces as jest.Mock
const approve = agentApi.approve as jest.Mock

/** waitFor bawaan versi ini tidak menunggu rantai promise efek; tunggu kondisinya secara eksplisit. */
async function settle(check: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 20))
  if (!check()) throw new Error('kondisi tidak terpenuhi dalam batas waktu')
}

beforeEach(() => {
  jest.clearAllMocks()
  useAgent.getState().reset()
  listDevices.mockResolvedValue([{ id: 'd1', name: 'Laptop A', online: true }])
  sessions.mockResolvedValue([{ id: 's1', preview: 'kerja tadi' }])
  workspaces.mockResolvedValue([{ path: '/proyek' }])
  approve.mockResolvedValue({ ok: true })
  configureAgentStore({ stream: async function* () {}, reload: async () => ({ messages: [{ role: 'user', content: 'halo dari riwayat' }] }) })
})

const frame = (item: unknown) => ({ event: item }) as never

test('memilih komputer lalu sesi, menampilkan riwayat, dan meneruskan approval', async () => {
  const view = await render(<AgentSheet visible onClose={() => {}} />)

  await settle(() => view.queryByTestId('agent-device-d1') !== null)
  fireEvent.press(view.getByTestId('agent-device-d1'))

  await settle(() => view.queryByTestId('agent-session-s1') !== null)
  fireEvent.press(view.getByTestId('agent-session-s1'))

  await settle(() => useAgent.getState().sessionId === 's1')
  await settle(() => view.queryByText('halo dari riwayat') !== null)

  await act(async () => {
    useAgent.getState().applyFrame(frame({ type: 'text', delta: 'sedang mengerjakan' }))
    useAgent.getState().applyFrame(frame({ type: 'approval_request', requestId: 'r1', tool: 'edit', target: 'a.txt', diff: '+ baris baru' }))
  })

  await settle(() => view.queryByTestId('agent-approval') !== null)
  fireEvent.press(view.getByTestId('agent-allow'))
  await settle(() => approve.mock.calls.length > 0)
  expect(approve).toHaveBeenCalledWith('d1', 's1', 'r1', 'yes')
})

test('menampilkan pesan ketika tidak ada komputer yang online', async () => {
  listDevices.mockResolvedValue([{ id: 'd9', name: 'Offline', online: false }])
  const view = await render(<AgentSheet visible onClose={() => {}} />)
  await settle(() => view.queryByTestId('agent-no-device') !== null)
  expect(view.getByTestId('agent-no-device')).toBeTruthy()
})
