import './helpers/mocks'
import Storage from 'expo-sqlite/kv-store'
import { AGENT_SESSION_KEY, useAgent } from '../src/agent/store'
import { emptyView } from '../src/agent/reduce'

jest.mock('../src/agent/notify', () => ({ notifyApproval: jest.fn(async () => true) }))
jest.mock('../src/agent/api', () => ({
  agentSession: jest.fn(), agentStart: jest.fn(), agentPrompt: jest.fn(),
  agentApprove: jest.fn(), agentCancel: jest.fn(), readAgentStream: jest.fn(),
}))
const api = jest.requireMock('../src/agent/api')
const notify = jest.requireMock('../src/agent/notify')

const live = (frames: unknown[], end = false) => (async function* () {
  for (const f of frames) yield f
  if (!end) await new Promise(() => { /* stays open like a real stream */ })
})()
const settled = (frames: unknown[]) => (async function* () { for (const f of frames) yield f })()

const reset = () => useAgent.setState({ deviceId: null, sessionId: null, cwd: null, view: emptyView, attached: false, busy: false })

afterEach(() => { jest.useRealTimers() })

beforeEach(() => {
  jest.clearAllMocks()
  Storage.setItemSync(AGENT_SESSION_KEY, '')
  reset()
})

describe('agent session store', () => {
  it('attach loads the baseline, persists the pair and appends live frames', async () => {
    api.agentSession.mockResolvedValue({ id: 's1', messages: [{ role: 'user', content: 'hola' }] })
    api.readAgentStream.mockReturnValue(live([{ event: { item: { type: 'text', delta: 'Hai' } } }]))
    await useAgent.getState().attach('d1', 's1', 'C:/work')
    const s = useAgent.getState()
    expect(s.attached).toBe(true)
    expect(s.view.entries.map(e => e.kind)).toEqual(['user', 'text'])
    expect(JSON.parse(Storage.getItemSync(AGENT_SESSION_KEY) || '{}')).toEqual({ deviceId: 'd1', sessionId: 's1', cwd: 'C:/work' })
    useAgent.getState().detach()
  })

  it('send appends the prompt, maps a busy refusal, and keeps the user entry only on success', async () => {
    api.agentSession.mockResolvedValue({ id: 's1', messages: [] })
    api.readAgentStream.mockReturnValue(live([]))
    await useAgent.getState().attach('d1', 's1', null)

    api.agentPrompt.mockResolvedValue({ turnId: 't1' })
    await expect(useAgent.getState().send('fix it')).resolves.toBe(true)
    expect(useAgent.getState().view.entries.at(-1)).toMatchObject({ kind: 'user', text: 'fix it' })

    api.agentPrompt.mockRejectedValue(Object.assign(new Error('busy'), { code: 'agent_busy' }))
    await expect(useAgent.getState().send('second')).resolves.toBe(false)
    expect(useAgent.getState().view.error).toBe('agent_busy')
    expect(useAgent.getState().view.entries.filter(e => e.kind === 'user').map(e => (e as { text: string }).text)).toEqual(['fix it'])
    useAgent.getState().detach()
  })

  it('approve sends the tapped answer once, clears the card, and keeps it when the call fails', async () => {
    useAgent.setState({ deviceId: 'd1', sessionId: 's1', attached: true, view: { ...emptyView, pending: { requestId: 'r1', tool: 'edit' }, turn: 'awaiting_approval' } })
    api.agentApprove.mockResolvedValue(undefined)
    await useAgent.getState().approve('session')
    expect(api.agentApprove).toHaveBeenCalledWith('d1', 's1', 'r1', 'session')
    expect(useAgent.getState().view.pending).toBeNull()

    useAgent.setState({ view: { ...emptyView, pending: { requestId: 'r2', tool: 'edit' }, turn: 'awaiting_approval' } })
    api.agentApprove.mockRejectedValue(Object.assign(new Error('busy'), { code: 'agent_busy' }))
    await useAgent.getState().approve('yes')
    expect(useAgent.getState().view.pending?.requestId).toBe('r2')
    expect(useAgent.getState().view.error).toBe('agent_busy')
  })

  it('reconnects after a dropped stream and reloads the baseline without duplicating entries', async () => {
    api.agentSession
      .mockResolvedValueOnce({ id: 's1', messages: [] })
      .mockResolvedValueOnce({ id: 's1', messages: [{ role: 'assistant', content: 'Hai' }] })
    api.readAgentStream
      .mockReturnValueOnce(settled([{ event: { item: { type: 'text', delta: 'Hai' } } }]))
      .mockReturnValueOnce(live([{ event: { heartbeat: true } }]))
    jest.useFakeTimers()
    const attached = useAgent.getState().attach('d1', 's1', null)
    await jest.advanceTimersByTimeAsync(0)
    await attached
    await jest.advanceTimersByTimeAsync(1_600)
    expect(api.agentSession).toHaveBeenCalledTimes(2)
    expect(useAgent.getState().view.entries.filter(e => e.kind === 'text')).toHaveLength(1)
    jest.useRealTimers()
    useAgent.getState().detach()
  })

  it('gives up after three consecutive failures with a retryable error', async () => {
    api.agentSession.mockResolvedValue({ id: 's1', messages: [] })
    api.readAgentStream.mockImplementation(() => { throw new Error('boom') })
    jest.useFakeTimers()
    const attached = useAgent.getState().attach('d1', 's1', null)
    await jest.advanceTimersByTimeAsync(8_000)
    await attached
    expect(useAgent.getState().view.error).toBe('unavailable')
    jest.useRealTimers()
    useAgent.getState().detach()
  })

  it('detach aborts the loop, clears persistence and resets the view', async () => {
    api.agentSession.mockResolvedValue({ id: 's1', messages: [{ role: 'user', content: 'hi' }] })
    api.readAgentStream.mockReturnValue(live([]))
    await useAgent.getState().attach('d1', 's1', null)
    useAgent.getState().detach()
    const s = useAgent.getState()
    expect(s.attached).toBe(false)
    expect(s.deviceId).toBeNull()
    expect(s.view.entries).toEqual([])
    expect(Storage.getItemSync(AGENT_SESSION_KEY)).toBe('')
  })

  it('restore re-attaches the persisted session', async () => {
    Storage.setItemSync(AGENT_SESSION_KEY, JSON.stringify({ deviceId: 'd9', sessionId: 's9', cwd: 'C:/w' }))
    api.agentSession.mockResolvedValue({ id: 's9', messages: [] })
    api.readAgentStream.mockReturnValue(live([]))
    await useAgent.getState().restore()
    expect(useAgent.getState().deviceId).toBe('d9')
    expect(api.agentSession).toHaveBeenCalledWith('d9', 's9', 'C:/w', expect.anything())
    useAgent.getState().detach()
  })

  it('notifies once per approval request, and stays silent while the session screen is open', async () => {
    api.agentSession.mockResolvedValue({ id: 's1', messages: [] })
    api.readAgentStream.mockReturnValue(live([
      { event: { item: { type: 'approval_request', requestId: 'r1', tool: 'edit', target: 'a.ts' } } },
      { event: { item: { type: 'approval_request', requestId: 'r1', tool: 'edit', target: 'a.ts' } } },
    ]))
    await useAgent.getState().attach('d1', 's1', null)
    await new Promise(r => setTimeout(r, 10))
    expect(notify.notifyApproval).toHaveBeenCalledTimes(1)
    expect(notify.notifyApproval.mock.calls[0][0]).toMatchObject({ requestId: 'r1' })

    notify.notifyApproval.mockClear()
    useAgent.setState({ sheet: 'session', view: { ...emptyView, pending: null } })
    api.readAgentStream.mockReturnValue(live([{ event: { item: { type: 'approval_request', requestId: 'r2', tool: 'bash' } } }]))
    await useAgent.getState().attach('d1', 's2', null)
    await new Promise(r => setTimeout(r, 10))
    expect(notify.notifyApproval).not.toHaveBeenCalled()
    useAgent.getState().detach()
  })
})