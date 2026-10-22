import './helpers/mocks'
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { AgentSessionSheet } from '../src/components/AgentSessionSheet'
import { emptyView } from '../src/agent/reduce'
import { useAgent } from '../src/agent/store'

const base = {
  deviceId: 'd1', sessionId: 's1', cwd: null, attached: true, busy: false,
  attach: jest.fn(), start: jest.fn(), send: jest.fn(), approve: jest.fn(), cancelTurn: jest.fn(), detach: jest.fn(), restore: jest.fn(),
}

beforeEach(() => { jest.clearAllMocks(); useAgent.setState({ ...base, view: emptyView }) })

describe('agent session screen', () => {
  it('shows the diff preview and sends exactly the tapped approval answer', async () => {
    const approve = jest.fn(async () => {})
    useAgent.setState({ ...base, approve, view: { ...emptyView, pending: { requestId: 'r1', tool: 'edit', target: 'a.ts', preview: '-old\n+new' }, turn: 'awaiting_approval' } })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    expect(r.getByTestId('agent-approval')).toBeTruthy()
    expect(r.getByText(/\+new/)).toBeTruthy()
    await fireEvent.press(r.getByTestId('agent-approve-session'))
    expect(approve).toHaveBeenCalledWith('session')
  })

  it('offers deny and allow-once with their own answers', async () => {
    const approve = jest.fn(async () => {})
    useAgent.setState({ ...base, approve, view: { ...emptyView, pending: { requestId: 'r1', tool: 'bash' }, turn: 'awaiting_approval' } })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('agent-approve-no'))
    await fireEvent.press(r.getByTestId('agent-approve-yes'))
    expect(approve.mock.calls).toEqual([['no'], ['yes']])
  })

  it('shows cancel while a turn runs and sends the typed prompt', async () => {
    const send = jest.fn(async () => true)
    useAgent.setState({ ...base, send, view: { ...emptyView, turn: 'running' } })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    expect(r.getByTestId('agent-cancel')).toBeTruthy()
    await fireEvent.changeText(r.getByTestId('agent-composer'), 'fix the tests')
    await fireEvent.press(r.getByTestId('agent-send'))
    expect(send).toHaveBeenCalledWith('fix the tests')
  })

  it('renders tool cards with their diff and a usage footer', async () => {
    useAgent.setState({ ...base, view: { ...emptyView, usage: { inputTokens: 12, outputTokens: 3 }, entries: [
      { kind: 'tool', id: 't1', tool: 'edit', target: 'a.ts', status: 'ok', output: 'Edited a.ts.', display: '@@ -1 +1 @@\n-old\n+new' },
    ] } })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    expect(r.getByTestId('agent-tool-t1')).toBeTruthy()
    expect(r.getByTestId('agent-diff-t1')).toBeTruthy()
    expect(r.getByTestId('agent-usage')).toBeTruthy()
    expect(r.getByText(/12/)).toBeTruthy()
  })

  it('maps a capacity error to actionable copy with retry', async () => {
    useAgent.setState({ ...base, view: { ...emptyView, error: 'agent_capacity' } })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    expect(r.getByText(/Two agent sessions/)).toBeTruthy()
    expect(r.getByTestId('agent-retry')).toBeTruthy()
  })

  it('keeps a missing-runtime error actionable with the install command', async () => {
    useAgent.setState({ ...base, view: { ...emptyView, error: 'agent_runtime_missing' } })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    expect(r.getByText(/npm i -g @botconnector\/bccli/)).toBeTruthy()
  })

  it('opens the session list from the header', async () => {
    const openPicker = jest.fn()
    useAgent.setState({ ...base, openPicker, view: emptyView })
    const r = await render(<AgentSessionSheet visible onClose={() => {}} />)
    await fireEvent.press(r.getByTestId('agent-sessions'))
    expect(openPicker).toHaveBeenCalled()
  })
})