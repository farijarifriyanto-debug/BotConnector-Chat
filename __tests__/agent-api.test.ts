import { AgentError, approve, cancel, capabilities, configureAgent, prompt, session, sessions, start, stream, workspaces } from '../src/agent/api'

type Call = { url: string; init: Record<string, any> }

function jsonResponse(result: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ result }) }
}
function errorResponse(status: number, code?: string) {
  return { ok: false, status, json: async () => ({ error: code ? { code } : {} }) }
}
/** Minimal reader over preset chunks; `stall: true` never resolves (idle watchdog). */
function streamResponse(chunks: string[], opts: { stall?: boolean } = {}) {
  let i = 0
  const encoder = new TextEncoder()
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (opts.stall) return new Promise(() => {})
          if (i >= chunks.length) return { done: true, value: undefined }
          return { done: false, value: encoder.encode(chunks[i++]) }
        },
        releaseLock: () => {},
      }),
    },
  }
}

function fakeTransport(replies: Array<unknown | ((url: string, init: Record<string, any>) => unknown)>) {
  const calls: Call[] = []
  const fn = async (url: string, init: Record<string, any> = {}) => {
    calls.push({ url, init })
    const next = replies.length > 1 ? replies.shift() : replies[0]
    return typeof next === 'function' ? (next as any)(url, init) : next
  }
  configureAgent({ token: () => 'tok', fetch: fn as any })
  return calls
}

const sse = (frames: unknown[]) => frames.map((f) => `data: ${JSON.stringify(f)}\n\n`)

describe('agent api — RPC', () => {
  it('calls the relay with method+params and bearer token', async () => {
    const calls = fakeTransport([jsonResponse({ supported: true, bccliVersion: '0.4.10' })])
    await expect(capabilities('dev1')).resolves.toMatchObject({ supported: true })
    expect(calls[0].url).toContain('/v1/client/devices/dev1/request')
    expect(JSON.parse(calls[0].init.body)).toEqual({ method: 'agent.capabilities', params: {} })
    expect(calls[0].init.headers.authorization).toBe('Bearer tok')
  })

  it('maps busy/auth/device codes to AgentError', async () => {
    fakeTransport([errorResponse(409, 'agent_busy')])
    await expect(prompt('dev1', 's1', 'hi')).rejects.toMatchObject({ name: 'AgentError', code: 'agent_busy' })
    fakeTransport([errorResponse(401)])
    await expect(capabilities('dev1')).rejects.toMatchObject({ code: 'auth' })
    fakeTransport([errorResponse(500, 'agent_runtime_missing')])
    await expect(workspaces('dev1')).rejects.toMatchObject({ code: 'agent_runtime_missing' })
  })

  it('normalizes start() session id and rejects an empty one', async () => {
    fakeTransport([jsonResponse({ sessionId: 'sess-1' })])
    await expect(start('dev1', '/home/u/proj')).resolves.toBe('sess-1')
    fakeTransport([jsonResponse({ id: 'sess-2' })])
    await expect(start('dev1', '/p')).resolves.toBe('sess-2')
    fakeTransport([jsonResponse({})])
    await expect(start('dev1', '/p')).rejects.toMatchObject({ code: 'device_error' })
  })

  it('passes through list/session/approve/cancel shapes and params', async () => {
    const calls = fakeTransport([
      jsonResponse([{ id: 's1', preview: 'hai' }]),
      jsonResponse({ id: 's1', cwd: '/p', permissionMode: 'ask', messages: [] }),
      jsonResponse({ ok: true }),
      jsonResponse({ ok: true }),
    ])
    await expect(sessions('dev1', '/p')).resolves.toEqual([{ id: 's1', preview: 'hai' }])
    await expect(session('dev1', 's1')).resolves.toMatchObject({ permissionMode: 'ask' })
    await approve('dev1', 's1', 'req9', 'session')
    await cancel('dev1', 's1')
    const [list, one, appr, canc] = calls.map((c) => JSON.parse(c.init.body))
    expect(list).toEqual({ method: 'agent.sessions', params: { cwd: '/p' } })
    expect(one).toEqual({ method: 'agent.session', params: { id: 's1' } })
    expect(appr).toEqual({ method: 'agent.approve', params: { sessionId: 's1', requestId: 'req9', answer: 'session' } })
    expect(canc).toEqual({ method: 'agent.cancel', params: { sessionId: 's1' } })
  })
})

describe('agent api — stream', () => {
  it('yields events verbatim and stops at done', async () => {
    fakeTransport([
      streamResponse(sse([{ event: { type: 'text', delta: 'ha' } }, { heartbeat: true }, { event: { type: 'text', delta: 'i' } }, { done: true }])),
    ])
    const got: string[] = []
    for await (const frame of stream('dev1', 's1')) got.push(frame.done ? 'done' : frame.heartbeat ? 'hb' : String((frame.event as any).delta))
    expect(got).toEqual(['ha', 'hb', 'i', 'done'])
  })

  it('throws agent_timeout when nothing arrives (idle watchdog)', async () => {
    fakeTransport([streamResponse([], { stall: true })])
    await expect((async () => { for await (const _ of stream('dev1', 's1', undefined, 30)) void _ })()).rejects.toMatchObject({ code: 'agent_timeout' })
  })

  it('surfaces an error event as AgentError with its code', async () => {
    fakeTransport([streamResponse(sse([{ event: { type: 'error', code: 'device_offline' } }]))])
    await expect((async () => { for await (const _ of stream('dev1', 's1')) void _ })()).rejects.toMatchObject({ code: 'device_offline' })
  })

  it('is an AgentError instance for aborted streams', async () => {
    const controller = new AbortController()
    controller.abort()
    fakeTransport([() => { throw new Error('aborted') }])
    await expect((async () => { for await (const _ of stream('dev1', 's1', controller.signal)) void _ })()).rejects.toBeInstanceOf(AgentError)
  })
})
