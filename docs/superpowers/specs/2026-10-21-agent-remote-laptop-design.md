# Design: Remote agent sessions from the phone (laptop runtime)

Date: 2026-10-21 · Status: proposed (owner approved scope & direction) · Target release: 2.1.0 (after 2.0.0 ships)

## 1. Intent and why

BotConnector Chat users who paired a laptop can already chat with models running on that
laptop. This feature adds the next step: **run a coding-agent session (bccli) on the user's
own computer and drive it from the phone** — send a task, watch tool activity stream by, and
approve or deny risky actions from the phone.

Why: (a) it is a capability Kelivo (our closest open-source comparison) does not have — their
sandbox lives inside the phone, ours uses the computer the user already owns; (b) zero Apple
review risk (code executes on the user's computer, not on the device — guideline 2.5.2 is not
touched); (c) the transport (device pairing + relay) and the agent engine (bccli serve) both
already exist and are tested. This is mostly wiring, not new invention.

A cloud-hosted agent workspace (for users without a laptop) is explicitly **out of scope
here** — it is a separate follow-up project (see §12).

## 2. Goals / non-goals / anti-goals

**Goals (MVP):**
1. From the phone: list agent sessions on a paired device, start a new one in a chosen working
   directory, resume an existing one.
2. Send prompts; stream agent events (text, thinking, tool use, tool results incl. diffs,
   usage, turn result) live.
3. Approve/deny tool calls interactively with three choices: allow once / allow for this
   session / deny. Pending approvals survive a dropped phone connection (bccli already
   replays them on stream reopen).
4. Cancel a running turn.
5. Honest errors: device offline, agent runtime (bccli) missing on the computer, device CLI
   too old, turn busy — each with its own localized message (en/id first, English fallback
   for the other 15 languages).

**Non-goals (MVP):** live terminal/shell output streaming, file browser, MCP tools in agent
sessions, cloud sandboxes, scheduled tasks, plan-mode approval UI, subagent event UI,
session rewind/checkpoints, multi-device simultaneous sessions in one phone screen.

**Anti-goals (failure even if it works):**
- Any new inbound network exposure on the user's computer (no port forwarding, no LAN
  listening). `bccli serve` stays loopback-only; the Device CLI remains an outbound client.
- Auto-approving anything on the phone. The phone never answers approvals by itself.
- Silent fallbacks: if the device or runtime is missing, the UI says so; it must not pretend
  to work or route the agent to the cloud.
- Adding surface area to the pending 2.0.0 App Store submission. This ships in 2.1.0.

## 3. Current state (verified by recon 2026-10-21, with sources)

**bccli 0.4.8 `serve`** (repo `farijarifriyanto-debug/bccli`, recon clone
`%TEMP%\opencode\recon-bccli`) is already a complete remote-control loop:
- HTTP (Bearer token, loopback-only, trust fence): `GET /health`, `GET /v1/models`,
  `POST /v1/sessions {cwd?, permissionMode?, model?}`, `GET /v1/sessions?cwd=`,
  `GET /v1/sessions/:id`, `POST /v1/sessions/:id/messages {prompt}` → `202 {turnId}`
  (409 when busy), `POST /v1/sessions/:id/approvals {requestId, answer:
  yes|no|session|all}`, `POST /v1/sessions/:id/cancel` (fail-closes pending approvals).
  Contract: `docs/serve-api.md`. Body limit 1 MB.
- WS `/v1/mux`: frames `open {streamId, target:'session:<id>'}` / `cancel {streamId}`;
  receives `item` events `ready, text{delta}, thinking{delta}, tool_use{tool,target},
  tool_result{tool,output,isError}, usage, approval_request{requestId,tool,kind,target,
  preview}, error, result{...stopReason}`; multi-client broadcast; replays pending
  `approval_request`s on reopen; 2 s ping heartbeat; reconnect procedure = re-read baseline
  `GET /v1/sessions/:id` then reopen stream.
- Permission model: `yes/no/session/all`; never-grant list (secrets, sudo/sh, rm -r, force
  push, subshell tricks) enforced engine-side (`src/permissions.ts`).
- Known gaps for us: `tool_result` does not forward the `display` field (unified diff for
  edit results, `src/tools/edit.ts:175`); todo/plan/subagent events are not broadcast;
  served sessions have no MCP tools; one in-flight turn per session.

**Phone ↔ computer transport** (repo `BotConnector-Chat`): phone calls
`POST https://api.botconnector.id/v1/client/devices/{id}/request {method, params}` (one-shot
RPC) and `POST .../stream` (SSE, body `{method, params}`) — `src/laptop/api.ts:47-92`.
Methods in use today: `models.list`, `runtime.status`, `model.load`, `chat.cancel`,
`chat.completions`. The channel is method-agnostic on the client side. SSE parser:
`drainSse()` in `src/api/api.ts:192-203`; streamer registry per model-id prefix
(`registerStreamer`, `src/api/api.ts:206-208`).

**Computer side** (repo `BotConnector-Desktop` — contains BOTH ends):
- `cli/` = Device CLI (installed as `device-cli-v0.4.19.tgz`, auto-updated via launcher);
  holds the outbound WebSocket to `wss://app.botconnector.id/api/devices/socket` with a
  device token (`~/.botconnector-device/device.json`); executes relayed RPC methods;
  NAT-friendly (no inbound ports).
- `web/device-relay.cjs` = the relay service itself (server side), with tests.
- Device state includes `workspaces.json` (useful for §6 working-directory discovery).

**Known client-side gaps** (from recon): device error strings exist but are unwired
(`errDeviceOffline/Timeout/Relay/PairLimit/ModelMissing/Device` in `src/i18n/strings.ts:20,87`
— `kindOf()` flattens everything to `unavailable`); laptop SSE stream has no idle watchdog
(cloud has 90 s); no session resume/persistence for streams.

## 4. Architecture

```
Phone (BotConnector Chat)                BotConnector cloud                User's computer
┌────────────────────────┐   account bearer  ┌───────────────┐  device WS   ┌──────────────────────┐
│ Agent UI (new)         │ ── HTTP RPC ───▶  │ account-api    │ ───────────▶ │ Device CLI (bridge,  │
│  src/agent/*           │ ── SSE stream ─▶  │ /v1/client/    │              │  new agent.* module) │
│  store + event cards   │ ◀── events ─────  │ devices/*      │ ◀─────────── │   │ loopback HTTP/WS │
└────────────────────────┘                   │ device-relay   │              │   ▼                  │
                                             └───────────────┘              │ bccli serve          │
                                                                            │ (loopback, token)    │
                                                                            └──────────────────────┘
```

Principle: **pass bccli's serve contract through with minimal translation.** The phone
speaks a thin `agent.*` RPC vocabulary over the existing device channel; the Device CLI
translates each call to a local bccli serve HTTP call and mirrors the WS mux stream into the
relay SSE stream. No new servers, no new ports, no new auth systems.

## 5. Wire contract (relay methods and events)

All requests use the existing envelopes: RPC = `POST /devices/{id}/request {method, params}`
→ `{result}` or `{error:{code}}`; streaming = `POST /devices/{id}/stream` → SSE frames
`{event: …}` … `{done:true, result?}`.

New methods (Device CLI implements; relay must tolerate long-lived streams — see §11-R1):

| method | params | result | notes |
|---|---|---|---|
| `agent.capabilities` | – | `{supported:true, bccliVersion, deviceCliVersion}` | feature detection; old Device CLI → `method_not_found` error → app shows "update the app on your computer" |
| `agent.workspaces` | – | `[{path, name?, lastUsed?}]` | from `workspaces.json` + recent agent session cwds; cap 20, most recent first |
| `agent.sessions` | `{cwd?}` | `[{id, mtime, preview}]` | wraps `GET /v1/sessions?cwd=` |
| `agent.session` | `{id, cwd?}` | baseline `{id, cwd, permissionMode, messages}` | wraps `GET /v1/sessions/:id`; used on open/reconnect |
| `agent.start` | `{cwd, model?}` | `{sessionId}` | ensures bccli serve is running (§6), wraps `POST /v1/sessions` with `permissionMode:'ask'` (fixed — MVP never exposes `bypassPermissions`) |
| `agent.prompt` | `{sessionId, prompt}` | `{turnId}` | wraps messages; 409 → error code `agent_busy` |
| `agent.approve` | `{sessionId, requestId, answer}` | `{ok:true}` | `answer ∈ yes|no|session` (NOT `all` on mobile) |
| `agent.cancel` | `{sessionId}` | `{ok:true}` | wraps cancel |
| `agent.stream` | `{sessionId}` | SSE stream | long-lived; frames: `{event:{item:<bccli item>}}` verbatim pass-through of mux items; `{done:true}` when the mux stream ends; heartbeats per §6 |

Error codes (surface in app): `agent_runtime_missing` (bccli not installed/found),
`agent_unsupported` (Device CLI too old), `agent_busy`, plus existing device codes
(`device_offline`, `device_timeout`, `relay`).

Event items are **bccli serve items unchanged**: `ready, text, thinking, tool_use,
tool_result, usage, approval_request, error, result`. The only engine change: `tool_result`
gains the optional `display` field (unified diff) — see §7.

## 6. Device CLI bridge (repo BotConnector-Desktop, `cli/`)

- **bccli serve lifecycle**: start on first `agent.*` need — `bccli serve --port 0
  --token <random 32B hex>` (loopback only), capture the port from the banner/stderr or use
  `--port` with a free-port probe; store `{port, token, childPid}` in memory only. Health
  check `GET /health` before each call; restart once on failure. Idle-kill after 30 min with
  no open agent stream. Discover `bccli` on PATH, else `~/.bccli/bin`, else fail with
  `agent_runtime_missing`.
- **Per-session mux client**: for each active `agent.stream` request, open WS
  `ws://127.0.0.1:<port>/v1/mux` with the bearer token, send `open {streamId, target:
  'session:<id>'}`, forward every `item`/`end`/`error` frame into the relay SSE response,
  answer WS pings. On relay disconnect: close the mux stream (bccli keeps the turn running;
  pending approvals queue and replay on reopen — engine behavior, verified in recon).
- **Approval routing**: `agent.approve` RPC → local `POST /v1/sessions/:id/approvals`.
  bccli fail-closes pending approvals on cancel/turn-end/server-close — no extra logic
  needed in the bridge.
- **Concurrency (MVP)**: one Device CLI handles multiple sessions but the phone UI drives
  one active session screen at a time; bccli enforces one in-flight turn per session.
- **Relay side** (`web/device-relay.cjs`): verify and, if needed, extend max stream duration
  and heartbeat tolerance for `agent.stream` (currently sized for one chat answer). Keep the
  change method-agnostic (no agent-specific logic in the relay if avoidable).

## 7. bccli patch (repo bccli)

- Forward `display` (and keep `isError`) in serve `tool_result` items
  (`src/serve.ts:420` mapping in `runTurn`), so post-execution diffs reach remote clients;
  today diffs only appear inside `approval_request.preview`.
- Update `docs/serve-api.md` (item schema) + regression test in `test/serve.test.ts`
  (edit tool → `tool_result.display` contains the unified diff).
- Optional (only if cheap): broadcast todo events. Otherwise deferred — not MVP.

## 8. Phone app (repo BotConnector-Chat)

- **`src/agent/api.ts`**: thin wrappers over `src/laptop/api.ts` request/stream for the
  methods in §5; SSE parsing reuses `drainSse`; register `agent.stream` consumption as a
  dedicated long-lived reader with an **idle watchdog (120 s without any frame incl.
  heartbeat → reconnect procedure: baseline `agent.session` → reopen `agent.stream`)**.
- **`src/agent/store.ts`** (zustand): `{device, sessionId, baseline messages, live items
  buffer, pendingApproval?, turnState, usage, error?}`; persists `{deviceId, sessionId, cwd}`
  in kv-store (`bc.agent.session.v1`) so reopening the app re-attaches.
- **UI**: entry point = Settings sheet item "Agent (computer)" next to the existing Laptop
  item (signed-in only, same gate as `open-laptop`). Flow: pick device (must be online) →
  session list (`agent.sessions`) or New → pick workspace (`agent.workspaces`) → session
  screen. Session screen reuses the chat message renderer for `text`/`thinking`
  (collapsible)/`tool_use`+`tool_result` cards (tool name, target, output preview, diff view
  for `display`), approval card (tool, target, preview/diff, 3 buttons: allow once / allow
  for session / deny), input box (prompt, cancel button while a turn runs), footer with
  token usage per turn.
- **Errors**: wire the already-existing device error strings; add new keys for
  `agent_runtime_missing`, `agent_unsupported`, `agent_busy`. New keys en + id inline in
  `src/i18n/strings.ts` (other packs fall back to English; `i18n.test.ts` guards parity).
- **Model choice for the session**: MVP uses the device's bccli default model (whatever
  `bccli` is configured with on that computer); `agent.start` accepts optional `model` but
  the UI does not expose a picker yet (deferred).

## 9. Security & privacy

- No inbound exposure: serve stays loopback; bridge is an outbound WS client (existing
  pattern). Token for serve is per-run random, memory-only.
- Auth: unchanged — account bearer (phone→cloud) + device token (cloud→computer). The bridge
  only accepts `agent.*` from the authenticated relay connection it already trusts.
- Approvals: phone shows engine-provided preview; `all` is deliberately not offered on
  mobile; engine's never-grant list still applies (it overrides any approval).
- Data: agent prompts/results transit BotConnector's relay (same as existing laptop chat);
  execution and files stay on the user's computer. Privacy copy must say this plainly
  (extend `provPrivacy`-style note in the Agent UI + privacy policy page).
- bccli permissionMode fixed to `ask`; `bypassPermissions` is not reachable from the phone.

## 10. Testing strategy

- **bccli**: unit/regression tests per repo convention (`test/serve*.test.ts`) for the
  `display` forwarding.
- **BotConnector-Desktop**: `.cjs` tests per existing pattern (device-bridge tests exist):
  bridge against a stub serve (recorded fixture of HTTP+WS), relay long-stream duration
  test, `agent_runtime_missing` path.
- **BotConnector-Chat**: jest — api wrappers (mock RPC/SSE per existing `composer.test.tsx`
  patterns), store transitions (event → cards; approval answer routing; reconnect on
  watchdog), approval UI (3 buttons → correct `answer`), i18n parity.
- **E2E (mandatory before release, real devices)**: real phone (TestFlight 2.1.0 beta) ↔
  real laptop (Device CLI + bccli installed): full loop = pair → start session → prompt that
  edits a file → approval card with diff → allow → diff in result → cancel mid-turn → kill
  phone network mid-approval → reopen → pending approval replayed. Mocks/fixtures do NOT
  count as E2E evidence (owner's global rule).

## 11. Risks & open items (builder must verify, in order)

- **R1 relay stream lifetime**: account-api/nginx/device-relay timeouts for hour-long SSE.
  nginx already allows 900 s read timeout on some routes (`botconnector-api.conf`); the
  agent stream needs heartbeats (bridge emits a `{event:{heartbeat}}` frame every 25 s) and
  possibly route timeout config. Verify before building UI.
- **R2 device-relay deployment**: `web/device-relay.cjs` lives in BotConnector-Desktop but
  runs server-side (app.botconnector.id/VPS). Confirm deploy pipeline & where account-api
  hands off to it, so the plan touches the right production artifact.
- **R3 account-api pass-through**: confirm `/v1/client/devices/{id}/request|stream` forwards
  arbitrary methods without a server-side allowlist; if an allowlist exists, `agent.*` must
  be added (production VPS change — follow owner's VPS rules: audit + backup first).
- **R4 bccli install base**: users' computers may not have bccli at all. MVP: clear error +
  a settings link with install instructions (npm `@botconnector/bccli`). Bundling bccli into
  the Device CLI installer is a later enhancement, not MVP.
- **R5 message size**: relay/account-api body limits for long tool outputs; bccli truncates
  large bash outputs to a file already; bridge should cap forwarded `output` at ~32 KB with
  a "truncated" marker (app shows full length).

## 12. Follow-up: cloud agent workspace (route 3, separate project)

Not designed here. Prerequisites identified by recon: merge & release Switchboard PR #24
(OpenSandbox local mode, QA-passed draft); per-user tenancy & auth (none exists); isolation
hardening (gVisor/rootless, egress blocking, remove docker.sock exposure); capacity
scheduler + quotas + billing on a 15 GB VPS (~teens of concurrent sandboxes); per-user agent
session backend. Recommend a separate brainstorm+design after 2.0.0 ships and 2.1.0 (this
project) is in users' hands.

## 13. Decisions already made (owner) vs builder's latitude

**Owner decided**: routes 1+3 (3 deferred); MVP scope in §2 incl. 3-button approvals; order
= bccli patch → bridge/relay → app UI; ship as 2.1.0 after 2.0.0; no terminal view / file
browser / MCP in MVP; quick wins (device error strings, idle watchdog) included.

**Design author's calls (flag for review)**: pass-through event schema (no re-invention);
method names `agent.*`; fixed `permissionMode:'ask'`; no model picker in MVP; entry via
Settings sheet; 120 s watchdog / 25 s heartbeat; 30 min idle-kill for serve; one active
session screen at a time; document in English (repo convention); en+id strings first.

**Left to the builder**: exact file layout inside `src/agent/`; card visual details (follow
existing chat/theme components); Device CLI module structure; test fixture format;
workspaces discovery details beyond §6.

## 14. Builder-check resolutions (2026-10-21)

A fresh builder reviewer read this document against the three repos and raised six
questions. Resolutions:

**Settled as design decisions (author's calls, owner may veto):**
- **B1 / doc Q6 — release branching**: the 2.0.0 App Store submission is frozen on build
  113 (verified via ASC inspect: submitted version locked, no editable version). Merges to
  this repo's `main` do not touch the submission. Still, the phone-side Agent UI lives on a
  feature branch and merges to `main` only after 2.0.0 resolves (approved or rejected), so a
  re-cut 2.0.x build can never contain half-done agent surface. bccli and BotConnector-Desktop
  work merges independently (separate artifacts, separate release channels).
- **B2 / doc Q3 — session baseline size**: the bridge truncates the baseline it returns for
  `agent.session` to the most recent messages within ~200 KB, adding
  `{truncated:true, omittedCount:n}`; the phone shows a "earlier history truncated" marker.
  No bccli pagination change in MVP. Rationale: relay frames cap at 1 MB and request bodies
  at 256 KB — reconnect must not fail on long sessions.
- **B3 / doc Q5 — bccli installed but not configured**: the bridge preflights bccli (exists,
  serve-compatible version, has usable provider config) at `agent.capabilities` and
  `agent.start`, and returns a distinct localized error `agent_not_configured` with a setup
  link. Raw engine errors are never the first-run experience (anti-goal: silent fallbacks /
  dishonest errors).
- **B4 — tool output cap**: forwarded `tool_result.output` is capped at ~32 KB with a
  truncated marker (formalizes R5).
- **B5 / doc Q2 — release runbook**: the plan MUST include a verified publish runbook for
  both production artifacts before first release: (a) Device CLI tgz + manifest path from
  GitHub Releases to `https://app.botconnector.id/device-cli.json` (launcher rejects
  cross-origin tgz URLs — the mirror/rewrite step must be found and documented), and (b)
  the deployed relay artifact and its update procedure. If either pipeline cannot be
  verified, the feature does not ship.

**Open — owner decision required (see conversation):**
- **O1 / doc Q1 — account-api & production scope**: `/v1/client/devices/{id}/request|stream`
  behavior (method allowlist? SSE buffering? timeout caps?) must be inspected in the
  production backend, and changes there (plus nginx stream timeouts) are likely needed.
  Needs owner authorization for production VPS work under the standing VPS rules
  (audit + backup + canary + rollback), and a concurrency policy for hour-long streams.
- **O2 / doc Q4 — updating already-paired devices**: the launcher checks for Device CLI
  updates only at start, so existing paired computers lack `agent.*` until restarted. MVP
  plan A: honest `agent_unsupported` error + guidance (accept this as the primary first-run
  experience). Plan B: add a relay-driven "restart to update" nudge (extra relay+launcher
  work). Owner chooses.
