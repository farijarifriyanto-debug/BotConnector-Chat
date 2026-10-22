# Agent sessions from the phone — Implementation Plan (Plan C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can drive a coding-agent session running on their paired computer from the phone: pick the computer, open or start a `bccli` session in a workspace, send a prompt, watch text/tool items stream in, approve or deny a tool with the engine's own diff preview, cancel a turn — and have the app re-attach with a replayed pending approval after the stream drops.

**Architecture:** A thin transport layer (`src/agent/api.ts`) wraps the existing `/v1/client/devices/{id}/request|stream` endpoints for the nine `agent.*` RPC methods that are already live in production (Device CLI `0.4.20`). A pure reducer (`src/agent/reduce.ts`) turns SSE frames into a transcript the UI renders. A zustand store (`src/agent/store.ts`) owns attach/send/approve/cancel plus a 120 s idle watchdog that re-loads the baseline (`agent.session`) and re-opens `agent.stream` after a drop. Two modals (`AgentSheet`, `AgentSessionSheet`) reuse the existing theme, `Markdown`, and `Text` components.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, zustand, `expo/fetch`, `expo-sqlite/kv-store`, jest + `jest-expo` + `@testing-library/react-native`. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-21-agent-remote-laptop-design.md` (merged on `main` as `ee3fc0f`), §5 wire contract, §8 phone app, §9 security, §10 testing. As-built wire reference (real production payloads): `farijarifriyanto-debug/BotConnector-Desktop` → `docs/superpowers/specs/2026-10-21-agent-bridge-wire-asbuilt.md`.

## Global Constraints

- **Server contract is frozen and live** (Device CLI `0.4.20`, relay caps `2` streams/account + `20` global). Error codes arrive lowercase: `agent_runtime_missing`, `agent_not_configured`, `agent_unsupported`, `agent_busy`, `agent_capacity`, `agent_invalid_params`, plus the existing `device_offline`, `device_timeout`, `device_method_not_allowed`.
- **Approvals:** only `yes` (allow once), `session` (allow for this session), `no` (deny). `all` must never be offered. No auto-approve anywhere in the client.
- **`permissionMode` is always `ask`**, set server-side by the Device CLI; the app never sends it.
- **Timing:** the bridge emits `{"event":{"heartbeat":true}}` every `25 s`; the app watchdog fires after `120 s` with no frame; after a drop the app reloads `agent.session` and reopens `agent.stream` (max 3 consecutive failures, then a retryable error).
- **Devices:** the entry point is hidden for guests (`!guest`, same gate as `open-laptop`). A paired device that does not advertise `agent.start` in `capabilities` is shown with an update hint, never offered as usable.
- **Payload hygiene:** `display`/`output` come from the engine already capped by the bridge (32 KB output, ≤900 KB event). The UI must truncate for *display* only and never re-send them.
- **i18n:** new keys go in `en` **and** `id` inline in `src/i18n/strings.ts`; other packs fall back to English. `__tests__/i18n.test.ts` guards unknown keys and placeholder parity — do not add keys to its `used` list.
- **Repo mechanics:** no new dependencies; `tsconfig` is `strict`; jest `testMatch` is `__tests__/**/*.test.ts?(x)`; run `npm run typecheck` and the named test file after every task, full `npm test` before the last commit.
- **Anti-goals:** no new inbound ports, no cloud fallback when a device or engine is missing (show the honest error instead), no storing prompts/transcripts on the server, no touching the App Store submission of 2.0.0 (this work targets 2.1.0).

## Review Focus

1. **Watchdog and reconnect** (the stream lives for hours and the phone changes networks): a stalled or silently dropped SSE must recover by itself, must not duplicate transcript entries after the baseline reload, and must not spin forever when the laptop is gone. Pinned by Task 3 (watchdog) and Task 4 (reconnect + `detach`).
2. **Approval correctness**: a tapped button must send exactly `yes`/`session`/`no`, must disable while in flight, must not resolve a newer approval with the answer meant for an older one, and a replayed approval after reconnect must still work. Pinned by Task 4 and Task 7.
3. **Frame-shape tolerance**: `text`/`thinking` may carry `delta` or `text`; tool items may arrive with or without `id`; `result` may arrive after partial text. A frame the app does not recognise must be ignored, never crash the transcript. Pinned by Task 2.
4. **Missing engine, old CLI, capacity**: `agent_runtime_missing`, `agent_unsupported`, `agent_capacity` must reach the user as actionable copy (install/update command, "close another agent session"), never as a blank screen or a generic failure. Pinned by Task 5 and Task 7.
5. **Guest and signed-out state**: no agent UI for guests; a 401 mid-session must clear the attachment and show the auth message rather than retrying forever. Pinned by Task 6 and Task 4.

---

### Task 1: Transport seam — device `capabilities`, `deviceRequest`, `deviceStream`

**Files:**
- Modify: `src/laptop/api.ts` (export `deviceRequest` in place of the private `request`, add `deviceStream`, extend `Device` with `capabilities`)
- Test: `__tests__/laptop.test.ts` (existing file, add cases)

**Interfaces:**
- Consumes: `expo/fetch`, `API_BASE`, existing `headers()`/`LaptopError`/`call` helpers in the same file.
- Produces (used by Tasks 3, 6):
  - `export interface Device { id: string; name: string; online: boolean; platform?: string; capabilities: string[] }` (missing/absent field maps to `[]`)
  - `export async function deviceRequest<T>(deviceId: string, method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T>` — returns the `result` field, throws `LaptopError` for HTTP failures
  - `export async function deviceStream(deviceId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response>` — POSTs to `/…/{id}/stream` with `accept: text/event-stream`, throws `LaptopError('auth' | code | 'network' | 'aborted')`, returns the raw `Response` when `ok` and `body` present

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe`)

```ts
it('surfaces the capabilities the laptop advertised, and defaults to none', async () => {
  mockFetch.mockResolvedValueOnce(json({ data: [
    { id: 'd1', name: 'Laptop', online: true, capabilities: ['agent.start', 'agent.stream'] },
    { id: 'd2', name: 'Old laptop', online: false },
  ] }))
  const rows = await listDevices()
  expect(rows[0].capabilities).toEqual(['agent.start', 'agent.stream'])
  expect(rows[1].capabilities).toEqual([])
})

it('deviceStream sets SSE headers and maps a device error code', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { code: 'agent_capacity' } }) })
  await expect(deviceStream('d1', { method: 'agent.stream', params: { sessionId: 's1' } })).rejects.toMatchObject({ code: 'agent_capacity', status: 429 })
  expect(mockFetch.mock.calls[0][1].headers.accept).toBe('text/event-stream')
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/laptop.test.ts` → the two new tests FAIL (`rows[0].capabilities` undefined, `deviceStream` not exported), old tests PASS.
- [ ] **Step 3: Implement** per Produces. Keep `call` unchanged; `deviceRequest` is the old `request` body exported (update its three internal call sites in `listModels`/`streamLaptop`). `deviceStream` reuses `headers(true)` plus `accept: 'text/event-stream'` and the same error-code extraction loop as `call`.
- [ ] **Step 4: Run** `npm test -- __tests__/laptop.test.ts` → all PASS (no change to existing behaviour).
- [ ] **Step 5: Commit** `feat(laptop): expose device capabilities, request and stream helpers for the agent layer`.

### Task 2: Transcript model — types + pure reducer

**Files:**
- Create: `src/agent/types.ts`
- Create: `src/agent/reduce.ts`
- Test: `__tests__/agentreduce.test.ts`

**Interfaces:**
- Consumes: nothing (pure TypeScript).
- Produces (used by Tasks 3, 4, 7):

```ts
export type AgentItem =
  | { type: 'ready'; sessionId?: string; host?: { home?: string; version?: string } }
  | { type: 'text'; delta?: string; text?: string }
  | { type: 'thinking'; delta?: string; text?: string }
  | { type: 'tool_use'; id?: string; tool?: string; name?: string; target?: string; input?: unknown }
  | { type: 'tool_result'; id?: string; tool?: string; name?: string; target?: string; output?: string; isError?: boolean; display?: string }
  | { type: 'approval_request'; requestId: string; tool?: string; kind?: string; target?: string; preview?: string }
  | { type: 'result'; text?: string; usage?: { inputTokens?: number; outputTokens?: number }; stopReason?: string }
export type AgentFrame = { event?: { item?: AgentItem } | { heartbeat?: true } } | { done?: true } | { error?: { message?: string; code?: string } }
export interface AgentApproval { requestId: string; tool?: string; kind?: string; target?: string; preview?: string }
export interface AgentBaseline { id: string; cwd?: string; permissionMode?: string; messages?: { role?: string; content?: unknown }[]; truncated?: boolean; omittedCount?: number }
export type AgentEntry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tool'; id: string; tool: string; target?: string; status: 'running' | 'ok' | 'error'; output?: string; display?: string }
  | { kind: 'result'; id: string; text: string }
  | { kind: 'error'; id: string; code?: string; text: string }
export interface AgentView { entries: AgentEntry[]; pending: AgentApproval | null; turn: 'idle' | 'running' | 'awaiting_approval'; usage: { inputTokens?: number; outputTokens?: number } | null; error: string | null }
export const emptyView: AgentView
export const baselineToView = (baseline: AgentBaseline): AgentView
export const appendUser = (view: AgentView, text: string): AgentView
export const reduceFrame = (view: AgentView, frame: AgentFrame): AgentView
```

Rules pinned: `text`/`thinking` accept `delta ?? text`; consecutive deltas append to the last entry of the same kind, a different kind starts a new entry; `tool_use` creates a `running` tool entry keyed by `id` when present else `` `${tool}:${target}:${entries.length}` ``; `tool_result` updates the matching id, else the last `running` entry with the same `tool`+`target`, else appends a finished tool entry; `approval_request` sets `pending` and `turn: 'awaiting_approval'`; a `result` frame appends a `result` entry, sets `turn: 'idle'`, `usage`, clears `pending`; a top-level `{error:{code,text}}` appends an `error` entry, sets `turn: 'idle'`, `error: code ?? 'unavailable'`, clears `pending`; heartbeats and unknown frames return the same view object.

- [ ] **Step 1: Write the failing tests**

```ts
import { baselineToView, emptyView, appendUser, reduceFrame } from '../src/agent/reduce'

it('accumulates text deltas and starts a new entry when the kind changes', () => {
  let v = reduceFrame(emptyView, { event: { item: { type: 'text', delta: 'Hel' } } })
  v = reduceFrame(v, { event: { item: { type: 'text', delta: 'lo' } } })
  v = reduceFrame(v, { event: { item: { type: 'thinking', text: 'plan first' } } })
  v = reduceFrame(v, { event: { item: { type: 'text', delta: ' again' } } })
  expect(v.entries.map(e => e.kind)).toEqual(['text', 'thinking', 'text'])
  expect(v.entries[0]).toMatchObject({ text: 'Hello' })
})

it('pairs tool_use with tool_result by id, else by tool and target', () => {
  let v = reduceFrame(emptyView, { event: { item: { type: 'tool_use', id: 't1', tool: 'edit', target: 'a.ts' } } })
  v = reduceFrame(v, { event: { item: { type: 'tool_result', id: 't1', output: 'ok', display: '@@ -1 +1 @@' } } })
  expect(v.entries).toHaveLength(1)
  expect(v.entries[0]).toMatchObject({ kind: 'tool', tool: 'edit', status: 'ok', display: '@@ -1 +1 @@' })
})

it('sets and clears the pending approval and records usage on result', () => {
  let v = reduceFrame(emptyView, { event: { item: { type: 'approval_request', requestId: 'r1', tool: 'edit', preview: '-old\n+new' } } })
  expect(v.pending?.requestId).toBe('r1'); expect(v.turn).toBe('awaiting_approval')
  v = reduceFrame(v, { event: { item: { type: 'result', text: 'done', usage: { inputTokens: 10, outputTokens: 2 } } } })
  expect(v.pending).toBeNull(); expect(v.turn).toBe('idle'); expect(v.usage).toEqual({ inputTokens: 10, outputTokens: 2 })
})

it('ignores heartbeats and unknown frames without changing the view', () => {
  const before = appendUser(emptyView, 'hi')
  expect(reduceFrame(before, { event: { heartbeat: true } })).toBe(before)
  expect(reduceFrame(before, { event: { item: { type: 'nope' } as never } })).toBe(before)
})

it('renders baseline messages newest-last and keeps the truncation flag', () => {
  const v = baselineToView({ id: 's1', truncated: true, omittedCount: 3, messages: [
    { role: 'user', content: 'halo' }, { role: 'assistant', content: 'Hai' },
  ] })
  expect(v.entries.map(e => e.kind)).toEqual(['user', 'text'])
  expect(v.entries[1]).toMatchObject({ text: 'Hai' })
  expect(v.turn).toBe('idle')
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentreduce.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `types.ts` + `reduce.ts` per Produces/Rules.
- [ ] **Step 4: Run** → all PASS.
- [ ] **Step 5: Commit** `feat(agent): transcript types and pure frame reducer`.

### Task 3: Agent RPC wrappers + SSE reader with idle watchdog

**Files:**
- Create: `src/agent/api.ts`
- Test: `__tests__/agentapi.test.ts`

**Interfaces:**
- Consumes: `deviceRequest`, `deviceStream` (Task 1); `drainSse` from `../api/api`; `AgentBaseline`, `AgentFrame` (Task 2).
- Produces (used by Tasks 4, 6):

```ts
export async function agentCapabilities(deviceId: string, signal?: AbortSignal): Promise<{ supported: boolean; deviceCliVersion?: string; bccliVersion?: string | null }>
export async function agentWorkspaces(deviceId: string, signal?: AbortSignal): Promise<{ path: string; name?: string; lastUsed?: string }[]>
export async function agentSessions(deviceId: string, cwd: string | null, signal?: AbortSignal): Promise<{ id: string; mtime?: string; preview?: string }[]>
export async function agentSession(deviceId: string, id: string, cwd: string | null, signal?: AbortSignal): Promise<AgentBaseline>
export async function agentStart(deviceId: string, cwd: string): Promise<{ sessionId: string }>
export async function agentPrompt(deviceId: string, sessionId: string, prompt: string): Promise<{ turnId: string | null }>
export async function agentApprove(deviceId: string, sessionId: string, requestId: string, answer: 'yes' | 'no' | 'session'): Promise<void>
export async function agentCancel(deviceId: string, sessionId: string): Promise<void>
export async function* readAgentStream(deviceId: string, sessionId: string, signal?: AbortSignal, idleMs?: number): AsyncGenerator<AgentFrame>
```

Pinned behaviour: every wrapper calls `deviceRequest` with the exact method name (`agent.capabilities`, `agent.workspaces`, `agent.sessions`, `agent.session`, `agent.start`, `agent.prompt`, `agent.approve`, `agent.cancel`); `agent.start` sends `{ cwd }` only; `agent.approve` sends `{ sessionId, requestId, answer }`; `readAgentStream` opens `deviceStream` with `{ method: 'agent.stream', params: { sessionId } }`, splits frames with `drainSse`, yields each parsed object, and aborts its own controller after `idleMs` (default `120_000`) without a chunk, throwing `LaptopError('stalled')`. A `{ done: true }` frame ends the generator normally.

- [ ] **Step 1: Write the failing tests**

```ts
import { agentStart, agentApprove, readAgentStream, agentCapabilities } from '../src/agent/api'
// same json()/sse() helpers as __tests__/laptop.test.ts, plus:
const sseWith = (chunks: string[]) => { const enc = new TextEncoder(); let i = 0; return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }), releaseLock() {} }) } } }

it('agent.start sends only cwd and returns the session id', async () => {
  mockFetch.mockResolvedValueOnce(json({ result: { sessionId: 'sess-1' } }))
  await expect(agentStart('d1', 'C:/work')).resolves.toEqual({ sessionId: 'sess-1' })
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ method: 'agent.start', params: { cwd: 'C:/work' } })
  expect(mockFetch.mock.calls[0][0]).toContain('/v1/client/devices/d1/request')
})

it('agent.approve forwards yes|no|session verbatim', async () => {
  mockFetch.mockResolvedValue(json({ result: { ok: true } }))
  for (const answer of ['yes', 'session', 'no'] as const) await agentApprove('d1', 's1', 'r1', answer)
  const bodies = mockFetch.mock.calls.map(c => JSON.parse(c[1].body))
  expect(bodies.map(b => b.params.answer)).toEqual(['yes', 'session', 'no'])
})

it('readAgentStream yields ready, item, heartbeat, done frames in order', async () => {
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
})

it('readAgentStream gives up after the idle window with a stalled error', async () => {
  jest.useFakeTimers()
  mockFetch.mockImplementationOnce(async (_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => {
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  }))
  const iterator = readAgentStream('d1', 's1', undefined, 50)
  const next = iterator.next()
  jest.advanceTimersByTime(60)
  await expect(next).rejects.toMatchObject({ code: 'stalled' })
  jest.useRealTimers()
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentapi.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** per Produces.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(agent): agent.* RPC wrappers and watchdogged SSE reader`.

### Task 4: Agent session store (attach, send, approve, cancel, reconnect)

**Files:**
- Create: `src/agent/store.ts`
- Test: `__tests__/agentstore.test.ts`

**Interfaces:**
- Consumes: everything from Task 3; `emptyView`, `baselineToView`, `appendUser`, `reduceFrame` (Task 2); `expo-sqlite/kv-store`.
- Produces (used by Tasks 6, 7):

```ts
interface AgentState {
  deviceId: string | null
  sessionId: string | null
  cwd: string | null
  view: AgentView
  attached: boolean
  busy: boolean
  attach(deviceId: string, sessionId: string, cwd?: string | null): Promise<void>
  start(deviceId: string, cwd: string): Promise<string>
  send(text: string): Promise<void>
  approve(answer: 'yes' | 'no' | 'session'): Promise<void>
  cancelTurn(): Promise<void>
  detach(): void
  restore(): Promise<void>
}
export const useAgent = create<AgentState>(...)
export const AGENT_SESSION_KEY = 'bc.agent.session.v1'
```

Pinned behaviour: `attach` persists `{deviceId, sessionId, cwd}` to `AGENT_SESSION_KEY`, loads `agentSession` into `baselineToView`, then runs the stream loop; the loop reconnects up to 3 consecutive times with `1_500 ms` backoff, reloading the baseline each time; any frame resets the failure counter; `detach` aborts the loop, clears the persisted key and resets to `emptyView`; `send` appends the user entry optimistically, sets `turn: 'running'`, and maps `agent_busy` to `view.error = 'agent_busy'` without losing the draft text; `approve` sets `busy` while in flight, calls `agentApprove` with the tapped answer, clears `pending` on success, and keeps `pending` on failure; `cancelTurn` calls `agentCancel` and sets `turn: 'idle'`.

- [ ] **Step 1: Write the failing tests** (mock the api module, not `expo/fetch`)

```ts
jest.mock('../src/agent/api', () => ({
  agentSession: jest.fn(), agentStart: jest.fn(), agentPrompt: jest.fn(),
  agentApprove: jest.fn(), agentCancel: jest.fn(), readAgentStream: jest.fn(),
}))
const api = jest.requireMock('../src/agent/api')
const frameStream = (frames: unknown[], done = true) => (async function* () {
  for (const f of frames) yield f
  if (done) return
  await new Promise(() => {})          // a live stream that never ends
})()

beforeEach(() => { jest.clearAllMocks(); useAgent.setState({ deviceId: null, sessionId: null, cwd: null, view: emptyView, attached: false, busy: false, error: null }) })

it('attach loads the baseline, persists the pair and appends live frames', async () => {
  api.agentSession.mockResolvedValue({ id: 's1', messages: [{ role: 'user', content: 'hola' }] })
  api.readAgentStream.mockReturnValue(frameStream([{ event: { item: { type: 'text', delta: 'Hai' } } }]))
  await useAgent.getState().attach('d1', 's1', 'C:/work')
  const s = useAgent.getState()
  expect(s.attached).toBe(true)
  expect(s.view.entries.map(e => e.kind)).toEqual(['user', 'text'])
  expect(JSON.parse(Storage.getItemSync(AGENT_SESSION_KEY) ?? '{}')).toEqual({ deviceId: 'd1', sessionId: 's1', cwd: 'C:/work' })
})

it('approve sends the tapped answer once, clears the card, and keeps it when the call fails', async () => {
  useAgent.setState({ view: { ...emptyView, pending: { requestId: 'r1', tool: 'edit' }, turn: 'awaiting_approval' } })
  api.agentApprove.mockResolvedValue(undefined)
  await useAgent.getState().approve('session')
  expect(api.agentApprove).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'r1', 'session')
  expect(useAgent.getState().view.pending).toBeNull()

  useAgent.setState({ view: { ...emptyView, pending: { requestId: 'r2', tool: 'edit' }, turn: 'awaiting_approval' } })
  api.agentApprove.mockRejectedValue(Object.assign(new Error('busy'), { code: 'agent_busy' }))
  await useAgent.getState().approve('yes')
  expect(useAgent.getState().view.pending?.requestId).toBe('r2')
  expect(useAgent.getState().view.error).toBe('agent_busy')
})

it('reconnects once after a dropped stream and reloads the baseline without duplicating entries', async () => {
  api.agentSession
    .mockResolvedValueOnce({ id: 's1', messages: [] })
    .mockResolvedValueOnce({ id: 's1', messages: [{ role: 'assistant', content: 'Hai' }] })
  api.readAgentStream
    .mockReturnValueOnce(frameStream([{ event: { item: { type: 'text', delta: 'Hai' } } }]))
    .mockReturnValueOnce(frameStream([{ event: { heartbeat: true } }], false))
  jest.useFakeTimers()
  const p = useAgent.getState().attach('d1', 's1', null)
  await jest.advanceTimersByTimeAsync(1_600)
  await p
  expect(api.agentSession).toHaveBeenCalledTimes(2)
  expect(useAgent.getState().view.entries.filter(e => e.kind === 'text')).toHaveLength(1)
  jest.useRealTimers()
})

it('gives up after three consecutive failures with a retryable error', async () => {
  api.agentSession.mockResolvedValue({ id: 's1', messages: [] })
  api.readAgentStream.mockImplementation(() => { throw new Error('boom') })
  jest.useFakeTimers()
  const p = useAgent.getState().attach('d1', 's1', null)
  await jest.advanceTimersByTimeAsync(6_000)
  await p
  expect(useAgent.getState().view.error).toBe('unavailable')
  jest.useRealTimers()
})

it('detach aborts the loop, clears persistence and resets the view', async () => {
  api.agentSession.mockResolvedValue({ id: 's1', messages: [] })
  api.readAgentStream.mockReturnValue(frameStream([], false))
  const p = useAgent.getState().attach('d1', 's1', null)
  useAgent.getState().detach()
  await p
  const s = useAgent.getState()
  expect(s.attached).toBe(false); expect(s.deviceId).toBeNull()
  expect(s.view.entries).toEqual([])
  expect(Storage.getItemSync(AGENT_SESSION_KEY)).toBeNull()
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentstore.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** per Produces.
- [ ] **Step 4: Run** → PASS, then `npm test -- __tests__/agentapi.test.ts __tests__/agentreduce.test.ts __tests__/agentstore.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(agent): session store with attach, approvals, cancel and reconnect`.

### Task 5: Copy for the agent surface (en + id)

**Files:**
- Modify: `src/i18n/strings.ts` (add keys to `en` and to `id` only)
- Test: `__tests__/i18n.test.ts` (existing, no edits)

**Interfaces:**
- Produces (used by Tasks 6, 7) these exact keys: `agent`, `agentNote`, `agentDevices`, `agentNoDevices`, `agentRefresh`, `agentSessions`, `agentNoSessions`, `agentNew`, `agentWorkspaces`, `agentNoWorkspaces`, `agentStart`, `agentOpen`, `agentUpdateCli`, `agentUpdateCliHint`, `agentComposer`, `agentSend`, `agentCancelTurn`, `agentRunning`, `agentApproval`, `agentAllow`, `agentAllowSession`, `agentDeny`, `agentThinking`, `agentToolRunning`, `agentToolOk`, `agentToolError`, `agentUsage`, `agentTruncated`, `agentPrivacy`, `agentErrRuntime`, `agentErrNotConfigured`, `agentErrUnsupported`, `agentErrBusy`, `agentErrCapacity`, `agentErrOffline`, `agentErrTimeout`, `agentErrAuth`, `agentErrGeneric`, `agentRetry`, `agentClose`, `agentDiff`.

Pinned copy (en): `agent: 'Agent (computer)'`, `agentNote: 'Run a coding agent on your paired computer. Files and commands stay on that computer; prompts and results pass through BotConnector.'`, `agentErrCapacity: 'Two agent sessions are already running on this account. Close one and try again.'`, `agentErrUnsupported: 'Update BotConnector Local on that computer: npm i -g @botconnector/bccli'`, `agentErrRuntime: 'That computer has no agent runtime yet. Install it with: npm i -g @botconnector/bccli'`, `agentPrivacy: 'The agent runs on your computer. The phone only sends prompts and approvals through the relay.'`. Indonesian must be natural, same placeholders, e.g. `agentErrCapacity: 'Sudah ada dua sesi agen berjalan di akun ini. Tutup salah satu lalu coba lagi.'`.

- [ ] **Step 1: Write the failing test** — `__tests__/agentcopy.test.ts`:

```ts
import { STRINGS } from '../src/i18n/strings'
const KEYS = ['agent','agentNote','agentDevices','agentNoDevices','agentSessions','agentNew','agentWorkspaces','agentStart','agentApproval','agentAllow','agentAllowSession','agentDeny','agentErrRuntime','agentErrCapacity','agentErrUnsupported','agentErrBusy','agentErrOffline','agentPrivacy','agentDiff']
it('has agent copy in English and Indonesian', () => {
  for (const k of KEYS) { expect(STRINGS.en[k as never]).toBeTruthy(); expect(STRINGS.id[k as never]).toBeTruthy() }
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentcopy.test.ts __tests__/i18n.test.ts` → FAIL (missing keys).
- [ ] **Step 3: Add** the full key list to `en` and `id` inline.
- [ ] **Step 4: Run** → both PASS (the parity test forbids unknown keys in other packs and placeholder drift).
- [ ] **Step 5: Commit** `feat(i18n): agent session copy in English and Indonesian`.

### Task 6: Device and session picker (`AgentSheet`)

**Files:**
- Create: `src/components/AgentSheet.tsx`
- Test: `__tests__/agentsheet.test.tsx`

**Interfaces:**
- Consumes: `useLaptop` (`entries` with `device.capabilities`), `agentCapabilities`, `agentSessions`, `agentWorkspaces`, `agentStart`; `useT`, `useTheme`, `Icon`, `Text`.
- Produces (used by Task 7): `export function AgentSheet({ visible, onClose, onOpenSession }: { visible: boolean; onClose: () => void; onOpenSession: (target: { deviceId: string; sessionId: string; cwd: string | null }) => void })`.

Pinned behaviour: on `visible` refresh devices; a device row is enabled only when `online` **and** `capabilities.includes('agent.start')`; a disabled row shows `agentUpdateCli` + `agentUpdateCliHint`; tapping an enabled device loads `agentSessions(deviceId, null)` and shows the list plus `agentNew`; `agentNew` loads `agentWorkspaces`, tapping a workspace calls `agentStart(deviceId, path)` and then `onOpenSession` with the new id; a `agent_capacity`/`agent_runtime_missing` failure on start shows the mapped copy inline; testIDs `agent-device-<name>`, `agent-new`, `agent-workspace-<basename>`, `agent-session-<id>`, `agent-error`.

- [ ] **Step 1: Write the failing tests** (mock `../src/agent/api`; render with `@testing-library/react-native`)

```tsx
it('offers only online devices that advertise agent.start', async () => {
  // devices: [online+capable 'Laptop A', online w/o capability 'Old laptop']
  render(<AgentSheet visible onClose={() => {}} onOpenSession={() => {}} />)
  expect(await screen.findByTestId('agent-device-Laptop A')).toBeTruthy()
  expect(screen.getByTestId('agent-device-Old laptop')).toBeDisabled()
  expect(screen.getByText(/npm i -g @botconnector\/bccli/)).toBeTruthy()
})

it('starts a session in the chosen workspace and opens it', async () => {
  // sessions → [], workspaces → [{path:'C:/work', name:'work'}], start → {sessionId:'s9'}
  render(<AgentSheet visible onClose={() => {}} onOpenSession={onOpen} />)
  fireEvent.press(await screen.findByTestId('agent-device-Laptop A'))
  fireEvent.press(await screen.findByTestId('agent-new'))
  fireEvent.press(await screen.findByTestId('agent-workspace-work'))
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ deviceId: 'd1', sessionId: 's9', cwd: 'C:/work' }))
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentsheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement** per Produces.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(agent): device, session and workspace picker sheet`.

### Task 7: Session screen (`AgentSessionSheet`)

**Files:**
- Create: `src/components/AgentSessionSheet.tsx`
- Test: `__tests__/agentsession.test.tsx`

**Interfaces:**
- Consumes: `useAgent` (Task 4), `Markdown`, `Text`, `Icon`, `useT`, `useTheme`; `AgentEntry`/`AgentApproval` (Task 2).
- Produces (used by Task 8): `export function AgentSessionSheet({ visible, onClose }: { visible: boolean; onClose: () => void })` — reads the active session from `useAgent`.

Pinned behaviour: on open, if `useAgent` has no attachment but a persisted pair exists, call `restore()`; render entries in order (`user`/`text` through `Markdown`, `thinking` collapsed behind a toggle labelled `agentThinking`, `tool` as a card with tool name + target + status icon and `output` preview, `display` rendered in a monospace block labelled `agentDiff`, `result` as assistant text, `error` as a danger banner); when `view.pending` exists render the approval card with exactly three buttons — `agentAllow` → `approve('yes')`, `agentAllowSession` → `approve('session')`, `agentDeny` → `approve('no')` — all disabled while `busy`; the composer sends with `agentSend` and clears only on success; a cancel button (`agentCancelTurn`) is shown while `view.turn !== 'idle'`; footer shows `agentUsage` with `{i}`/`{o}` when usage exists; `view.error` maps through the copy keys (`agentErrRuntime`, `agentErrCapacity`, …) with an `agentRetry` action calling `restore()`; testIDs `agent-session`, `agent-approval`, `agent-approve-yes`, `agent-approve-session`, `agent-approve-no`, `agent-composer`, `agent-send`, `agent-cancel`, `agent-usage`, `agent-error`, `agent-retry`.

- [ ] **Step 1: Write the failing tests** (set store state directly via `useAgent.setState`, no network)

```tsx
it('shows the diff preview and sends exactly the tapped approval answer', async () => {
  useAgent.setState({ view: { ...emptyView, pending: { requestId: 'r1', tool: 'edit', target: 'a.ts', preview: '-old\n+new' }, turn: 'awaiting_approval' } })
  const spy = jest.spyOn(useAgent.getState(), 'approve').mockResolvedValue()
  render(<AgentSessionSheet visible onClose={() => {}} />)
  expect(screen.getByTestId('agent-approval')).toBeTruthy()
  expect(screen.getByText(/\+new/)).toBeTruthy()
  fireEvent.press(screen.getByTestId('agent-approve-session'))
  await waitFor(() => expect(spy).toHaveBeenCalledWith('session'))
})

it('disables the composer send while a turn runs and offers cancel', async () => {
  useAgent.setState({ view: { ...emptyView, turn: 'running' } })
  render(<AgentSessionSheet visible onClose={() => {}} />)
  expect(screen.getByTestId('agent-cancel')).toBeTruthy()
})

it('maps a capacity error to actionable copy with retry', async () => {
  useAgent.setState({ view: { ...emptyView, error: 'agent_capacity' } })
  render(<AgentSessionSheet visible onClose={() => {}} />)
  expect(screen.getByText(/Two agent sessions/)).toBeTruthy()
  expect(screen.getByTestId('agent-retry')).toBeTruthy()
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentsession.test.tsx` → FAIL.
- [ ] **Step 3: Implement** per Produces.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(agent): session screen with transcript, approvals, composer and usage`.

### Task 8: Settings entry, gates, and branch close-out

**Files:**
- Modify: `src/components/SettingsSheet.tsx` (import + state + row + modal, next to `open-laptop`)
- Test: `__tests__/screens.test.tsx` (existing suite must stay green) and a new assertion in `__tests__/agentsheet.test.tsx`

**Interfaces:**
- Consumes: `AgentSheet`, `AgentSessionSheet` (Tasks 6, 7).
- Produces: a `open-agent` row gated by `!guest`, opening `AgentSheet`; selecting/creating a session closes the picker and opens `AgentSessionSheet`.

Pinned behaviour: the row sits directly under `open-laptop`, uses `agent` as its label and a `Laptop`-family icon; guests never see it; closing the session sheet returns to Settings without clearing the attachment (so reopening resumes).

- [ ] **Step 1: Write the failing test** — in `__tests__/agentsheet.test.tsx`:

```tsx
it('is reachable from Settings for signed-in users only', async () => {
  // render SettingsSheet with signed-in auth state; press open-agent; expect the picker title
  // render again with guest state; expect queryByTestId('open-agent') to be null
})
```

- [ ] **Step 2: Run** `npm test -- __tests__/agentsheet.test.tsx __tests__/screens.test.tsx` → FAIL (row missing), existing screens suite PASS.
- [ ] **Step 3: Implement** the Settings wiring.
- [ ] **Step 4: Run the full gates** `npm run typecheck` (0 errors) and `npm test` (all suites green).
- [ ] **Step 5: Commit** `feat(settings): agent sessions entry point and full typecheck/test gate`.

---

## Out of scope (deferred, tracked in the spec)

- Model picker for the agent session (`agent.start` accepts `model`, the UI uses the computer's default), sub-agent/todo broadcasts, MCP inside served sessions, bundling `bccli` into the Device CLI installer (R4), TestFlight/App Store submission of 2.1.0, and any change to the 2.0.0 review.
- Screenshot/shot scenes for the agent UI (the `SHOT` harness) — add later if the store screenshots need it.
