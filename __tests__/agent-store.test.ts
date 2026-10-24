// expo-sqlite/kv-store tidak bisa dimuat di jest (native module); cukup in-memory.
jest.mock('expo-sqlite/kv-store', () => {
  const mem = new Map<string, string>()
  const store = {
    getItemSync: (k: string) => mem.get(k) ?? null,
    setItemSync: (k: string, v: string) => void mem.set(k, v),
    removeItemSync: (k: string) => void mem.delete(k),
  }
  return { __esModule: true, default: store }
})

jest.mock('../src/agent/api', () => ({
  AGENT_IDLE_TIMEOUT_MS: 120_000,
  prompt: jest.fn(),
  approve: jest.fn(),
  cancel: jest.fn(),
  session: jest.fn(),
  stream: jest.fn(),
}))

import * as api from '../src/agent/api'
import { attachStream, configureAgentStore, useAgent } from '../src/agent/store'

const promptMock = api.prompt as jest.Mock
const approveMock = api.approve as jest.Mock
const cancelMock = api.cancel as jest.Mock
const sessionMock = api.session as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  useAgent.getState().reset()
  sessionMock.mockResolvedValue({ id: 's1', cwd: '/p', permissionMode: 'ask', messages: [] })
  configureAgentStore({})
})

const frame = (item: unknown) => ({ event: item }) as never

describe('agent store — frames', () => {
  it('appends text/tool items and ignores heartbeats and ready', () => {
    const s = useAgent.getState()
    s.applyFrame(frame({ type: 'ready', sessionId: 's1' }))
    s.applyFrame({ heartbeat: true } as never)
    s.applyFrame(frame({ type: 'text', delta: 'ha' }))
    s.applyFrame(frame({ type: 'tool_use', tool: 'edit', target: 'a.txt' }))
    expect(useAgent.getState().items.map((i) => i.type)).toEqual(['text', 'tool_use'])
  })

  it('tracks approval, usage, result and error', () => {
    const s = useAgent.getState()
    s.applyFrame(frame({ type: 'usage', inputTokens: 10, outputTokens: 3 }))
    expect(useAgent.getState().usage).toMatchObject({ inputTokens: 10 })
    s.applyFrame(frame({ type: 'approval_request', requestId: 'r1', tool: 'edit', target: 'a.txt', preview: '+ new' }))
    expect(useAgent.getState().pending).toMatchObject({ requestId: 'r1', tool: 'edit' })
    s.applyFrame(frame({ type: 'result', stopReason: 'stop' }))
    expect(useAgent.getState()).toMatchObject({ pending: null, turn: 'idle' })
    s.applyFrame(frame({ type: 'error', code: 'device_offline' }))
    expect(useAgent.getState()).toMatchObject({ error: 'device_offline', turn: 'idle' })
  })
})

describe('agent store — actions', () => {
  it('open() loads the baseline and remembers the ids', async () => {
    sessionMock.mockResolvedValue({ id: 's1', cwd: '/repo', permissionMode: 'ask', messages: [{ role: 'user', content: 'hai' }] })
    await useAgent.getState().open('dev1', 's1', '/repo')
    expect(useAgent.getState().baseline).toHaveLength(1)
    expect(useAgent.getState()).toMatchObject({ deviceId: 'dev1', sessionId: 's1', cwd: '/repo' })
  })

  it('send() trims, sets running and surfaces a busy error', async () => {
    await useAgent.getState().open('dev1', 's1')
    promptMock.mockResolvedValueOnce('turn-1')
    await useAgent.getState().send('  halo  ')
    expect(promptMock).toHaveBeenCalledWith('dev1', 's1', 'halo', undefined)
    expect(useAgent.getState().turn).toBe('running')

    useAgent.setState({ turn: 'idle' })
    promptMock.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'agent_busy' }))
    await useAgent.getState().send('lagi')
    expect(useAgent.getState()).toMatchObject({ turn: 'idle', error: 'agent_busy' })
  })

  it('answer() sends the chosen answer and clears the card', async () => {
    await useAgent.getState().open('dev1', 's1')
    useAgent.getState().applyFrame(frame({ type: 'approval_request', requestId: 'r1', tool: 'bash' }))
    approveMock.mockResolvedValue({ ok: true })
    await useAgent.getState().answer('session')
    expect(approveMock).toHaveBeenCalledWith('dev1', 's1', 'r1', 'session')
    expect(useAgent.getState().pending).toBeNull()
  })

  it('stop() cancels the turn', async () => {
    await useAgent.getState().open('dev1', 's1')
    cancelMock.mockResolvedValue({ ok: true })
    await useAgent.getState().stop()
    expect(cancelMock).toHaveBeenCalledWith('dev1', 's1')
    expect(useAgent.getState().turn).toBe('idle')
  })
})

describe('agent store — stream attach with reconnect', () => {
  it('applies frames until the stream ends', async () => {
    await useAgent.getState().open('dev1', 's1')
    configureAgentStore({
      stream: async function* () {
        yield frame({ type: 'text', delta: 'a' }) as never
        yield frame({ type: 'text', delta: 'b' }) as never
      },
    })
    await attachStream()
    expect(useAgent.getState().items).toHaveLength(2)
  })

  it('re-baselines and reopens once after a watchdog timeout', async () => {
    await useAgent.getState().open('dev1', 's1')
    let opened = 0
    configureAgentStore({
      stream: async function* () {
        opened += 1
        if (opened === 1) throw Object.assign(new Error('timeout'), { code: 'agent_timeout' })
        yield frame({ type: 'approval_request', requestId: 'r7', tool: 'edit' }) as never
      },
      reload: async () => ({ messages: [{ role: 'user', content: 'lama' }] }),
    })
    await attachStream()
    expect(opened).toBe(2)
    expect(useAgent.getState().pending).toMatchObject({ requestId: 'r7' })
    expect(useAgent.getState().baseline).toHaveLength(1)
  })

  it('gives up after the reconnect budget and reports the code', async () => {
    await useAgent.getState().open('dev1', 's1')
    configureAgentStore({
      stream: async function* () {
        throw Object.assign(new Error('timeout'), { code: 'agent_timeout' })
      },
      reload: async () => ({ messages: [] }),
    })
    await attachStream()
    expect(useAgent.getState().error).toBe('agent_timeout')
  })
})
