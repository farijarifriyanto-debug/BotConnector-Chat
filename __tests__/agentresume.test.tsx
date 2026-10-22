import './helpers/mocks'
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { AgentSheet } from '../src/components/AgentSheet'
import { useLaptop } from '../src/laptop/store'
import { useAgent } from '../src/agent/store'

jest.mock('../src/agent/api', () => ({
  agentCapabilities: jest.fn(), agentSessions: jest.fn(async () => []), agentWorkspaces: jest.fn(), agentStart: jest.fn(),
  agentSession: jest.fn(), agentPrompt: jest.fn(), agentApprove: jest.fn(), agentCancel: jest.fn(), readAgentStream: jest.fn(),
}))

describe('agent picker: continue last session', () => {
  it('offers the remembered session and opens it', async () => {
    useLaptop.setState({
      loading: false,
      error: null,
      entries: [{ device: { id: 'd1', name: 'Laptop A', online: true, capabilities: ['agent.start', 'agent.stream'] }, models: [] }],
    })
    useAgent.setState({
      deviceId: null,
      sessionId: null,
      cwd: null,
      attached: false,
      sheet: 'closed',
      resume: { deviceId: 'd1', sessionId: 's7', cwd: 'C:/work/demo' },
    })
    const onOpen = jest.fn()
    const r = await render(<AgentSheet visible onClose={() => {}} onOpenSession={onOpen} />)
    await fireEvent.press(await r.findByTestId('agent-resume'))
    expect(onOpen).toHaveBeenCalledWith({ deviceId: 'd1', sessionId: 's7', cwd: 'C:/work/demo' })
  })
})
