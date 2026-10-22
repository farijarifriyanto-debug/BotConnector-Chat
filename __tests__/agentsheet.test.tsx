import './helpers/mocks'
import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { AgentSheet } from '../src/components/AgentSheet'
import { useLaptop } from '../src/laptop/store'
import { SettingsSheet } from '../src/components/SettingsSheet'
import { useAuth } from '../src/store/auth'
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.setTimeout(30000)

jest.mock('../src/agent/api', () => ({
  agentCapabilities: jest.fn(), agentSessions: jest.fn(), agentWorkspaces: jest.fn(), agentStart: jest.fn(),
  agentSession: jest.fn(), agentPrompt: jest.fn(), agentApprove: jest.fn(), agentCancel: jest.fn(), readAgentStream: jest.fn(),
}))
const api = jest.requireMock('../src/agent/api')

beforeEach(() => {
  jest.clearAllMocks()
  useLaptop.setState({
    loading: false,
    error: null,
    entries: [
      { device: { id: 'd1', name: 'Laptop A', online: true, capabilities: ['agent.start', 'agent.stream'] }, models: [] },
      { device: { id: 'd2', name: 'Old laptop', online: true, capabilities: ['hardware.get'] }, models: [] },
      { device: { id: 'd3', name: 'Asleep', online: false, capabilities: ['agent.start'] }, models: [] },
    ],
  })
})

describe('agent picker', () => {
  it('offers only online devices that advertise agent.start', async () => {
    const r = await render(<AgentSheet visible onClose={() => {}} onOpenSession={() => {}} />)
    expect(await r.findByTestId('agent-device-Laptop A')).toBeTruthy()
    expect(r.getByTestId('agent-device-Old laptop').props.accessibilityState.disabled).toBe(true)
    expect(r.getByTestId('agent-device-Asleep').props.accessibilityState.disabled).toBe(true)
    expect(r.getAllByText(/npm i -g @botconnector\/bccli/).length).toBeGreaterThan(0)
  })

  it('lists existing sessions for the chosen computer', async () => {
    api.agentSessions.mockResolvedValue([{ id: 's1', preview: 'fix the tests' }])
    const onOpen = jest.fn()
    const r = await render(<AgentSheet visible onClose={() => {}} onOpenSession={onOpen} />)
    await fireEvent.press(await r.findByTestId('agent-device-Laptop A'))
    await fireEvent.press(await r.findByTestId('agent-session-s1'))
    expect(onOpen).toHaveBeenCalledWith({ deviceId: 'd1', sessionId: 's1', cwd: null })
  })

  it('starts a session in the chosen folder and opens it', async () => {
    api.agentSessions.mockResolvedValue([])
    api.agentWorkspaces.mockResolvedValue([{ path: 'C:/work/demo', name: 'demo' }])
    api.agentStart.mockResolvedValue({ sessionId: 's9' })
    const onOpen = jest.fn(), onClose = jest.fn()
    const r = await render(<AgentSheet visible onClose={onClose} onOpenSession={onOpen} />)
    await fireEvent.press(await r.findByTestId('agent-device-Laptop A'))
    await fireEvent.press(await r.findByTestId('agent-new'))
    await fireEvent.press(await r.findByTestId('agent-workspace-demo'))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ deviceId: 'd1', sessionId: 's9', cwd: 'C:/work/demo' }))
    expect(api.agentStart).toHaveBeenCalledWith('d1', 'C:/work/demo')
    expect(onClose).toHaveBeenCalled()
  })

  it('turns a capacity refusal during start into actionable copy', async () => {
    api.agentSessions.mockResolvedValue([])
    api.agentWorkspaces.mockResolvedValue([{ path: 'C:/work/demo' }])
    api.agentStart.mockRejectedValue(Object.assign(new Error('cap'), { code: 'agent_capacity' }))
    const r = await render(<AgentSheet visible onClose={() => {}} onOpenSession={() => {}} />)
    await fireEvent.press(await r.findByTestId('agent-device-Laptop A'))
    await fireEvent.press(await r.findByTestId('agent-new'))
    await fireEvent.press(await r.findByTestId('agent-workspace-demo'))
    expect(await r.findByText(/Two agent sessions/)).toBeTruthy()
  })

  it('settings entry is only for signed-in users and opens the picker', async () => {
    useAuth.setState({ status: 'signedIn' } as never)
    const r = await render(<SettingsSheet visible onClose={() => {}} />)
    expect(r.getByTestId('open-agent')).toBeTruthy()
    await fireEvent.press(r.getByTestId('open-agent'))
    expect(await r.findByTestId('agent-close')).toBeTruthy()

    r.unmount()
    useAuth.setState({ status: 'guest' } as never)
    const g = await render(<SettingsSheet visible onClose={() => {}} />)
    expect(g.queryByTestId('open-agent')).toBeNull()
  })
})