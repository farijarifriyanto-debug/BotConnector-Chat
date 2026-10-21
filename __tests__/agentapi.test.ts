import './helpers/mocks'
import { agentStart, agentApprove, agentCancel, agentCapabilities, agentSessions, agentSession, agentPrompt, agentWorkspaces, readAgentStream } from '../src/agent/api'
import { configureLaptop } from '../src/laptop/api'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
const mockFetch = jest.requireMock('expo/fetch').fetch as jest.Mock
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })
const sseWith = (chunks: string[]) => {
  const enc = new TextEncoder()
  let i = 0
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }),
        releaseLock() {},
      }),
    },
  }
}
const lastBody = () => JSON.parse(mockFetch.mock.calls.at(-1)![1].body)

beforeEach(() => { mockFetch.mockReset(); configureLaptop(() => 'tok') })

describe('agent RPC wrappers', () => {
  it('agent.start sends only cwd and returns the session id', async () => {
    mockFetch.mockResolvedValueOnce(json({ result: { sessionId: 'sess-1' } }))
    await expect(agentStart('d1', 'C:/work')).resolves.toEqual({ sessionId: 'sess-1' })
    expect(lastBody()).toEqual({ method: 'agent.start', params: { cwd: 'C:/work' } })
    expect(String(mockFetch.mock.calls[0][0])).toContain('/v1/client/devices/d1/request')
    expect(mockFetch.mock.calls[0][1].headers.authorization).toBe('Bearer tok')
  })

  it('agent.approve forwards yes|no|session verbatim', async () => {
    mockFetch.mockResolvedValue(json({ result: { ok: true } }))
    for (const answer of ['yes', 'session', 'no'] as const) await agentApprove('d1', 's1', 'r1', answer)
    const bodies = mockFetch.mock.calls.map(c => JSON.parse(c[1].body))
    expect(bodies.map(b => b.method)).toEqual(['agent.approve', 'agent.approve', 'agent.approve'])
    expect(bodies.map(b => b.params)).toEqual([
      { sessionId: 's1', requestId: 'r1', answer: 'yes' },
      { sessionId: 's1', requestId: 'r1', answer: 'session' },
      { sessionId: 's1', requestId: 'r1', answer: 'no' },
    ])
  })

  it('lists sessions with and without cwd, and loads one baseline', async () => {
    mockFetch.mockResolvedValueOnce(json({ result: [{ id: 's1', preview: 'hi' }] }))
    await expect(agentSessions('d1', null)).resolves.toEqual([{ id: 's1', preview: 'hi' }])
    expect(lastBody()).toEqual({ method: 'agent.sessions', params: {} })

    mockFetch.mockResolvedValueOnce(json({ result: { id: 's1', messages: [] } }))
    await agentSession('d1', 's1', 'C:/work')
    expect(lastBody()).toEqual({ method: 'agent.session', params: { id: 's1', cwd: 'C:/work' } })
  })

  it('passes capabilities, workspaces, prompt and cancel through', async () => {
    mockFetch.mockResolvedValue(json({ result: { supported: true, bccliVersion: '0.4.9' } }))
    await expect(agentCapabilities('d1')).resolves.toMatchObject({ supported: true, bccliVersion: '0.4.9' })
    expect(lastBody()).toEqual({ method: 'agent.capabilities', params: {} })

    mockFetch.mockResolvedValueOnce(json({ result: [{ path: 'C:/work', name: 'work' }] }))
    await expect(agentWorkspaces('d1')).resolves.toEqual([{ path: 'C:/work', name: 'work' }])

    mockFetch.mockResolvedValueOnce(json({ result: { turnId: 't1' } }))
    await expect(agentPrompt('d1', 's1', 'fix it')).resolves.toEqual({ turnId: 't1' })
    expect(lastBody()).toEqual({ method: 'agent.prompt', params: { sessionId: 's1', prompt: 'fix it' } })

    mockFetch.mockResolvedValueOnce(json({ result: { ok: true } }))
    await expect(agentCancel('d1', 's1')).resolves.toBeUndefined()
    expect(lastBody()).toEqual({ method: 'agent.cancel', params: { sessionId: 's1' } })
  })
})

describe('readAgentStream', () => {
  it('yields ready, item, heartbeat and done frames in order', async () => {
    mockFetch.mockResolvedValueOnce(sseWith([
      'data: {"event":{"item":{"type":"ready","sessionId":"s1"}}}\n\n',
      'data: {"event":{"item":{"type":"text","delta":"hi"}}}\n\n',
      'data: {"event":{"heartbeat":true}}\n\n',
      'data: {"done":true,"result":{"ok":true}}\n\n',
    ]))
    const out: unknown[] = []
    for await (const f of readAgentStream('d1', 's1')) out.push(f)
    expect(out).toHaveLength(4)
    expect(out[2]).toEqual({ event: { heartbeat: true } })
    expect(lastBody()).toEqual({ method: 'agent.stream', params: { sessionId: 's1' } })
  })

  it('gives up after the idle window with a stalled error', async () => {
    jest.useFakeTimers()
    mockFetch.mockImplementationOnce((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const iterator = readAgentStream('d1', 's1', undefined, 50)
    const next = iterator.next()
    jest.advanceTimersByTime(60)
    await expect(Promise.resolve(next)).rejects.toMatchObject({ code: 'stalled' })
    jest.useRealTimers()
  })

  it('stops quietly when the caller aborts, without reporting a stall', async () => {
    const ctrl = new AbortController()
    mockFetch.mockImplementationOnce((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const iterator = readAgentStream('d1', 's1', ctrl.signal, 5_000)
    const next = iterator.next()
    ctrl.abort()
    await expect(Promise.resolve(next)).resolves.toMatchObject({ done: true })
  })
})
