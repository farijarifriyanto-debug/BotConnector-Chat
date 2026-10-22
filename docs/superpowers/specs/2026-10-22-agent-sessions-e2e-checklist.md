# Agent Sessions — Real-Device E2E Checklist (2.1.0)

Status: **required before release** (spec §10). Unit tests do not count as E2E evidence.

- App build: **2.1.0 (build 116)**, TestFlight, branch `feat/agent-sessions-phone-20261022`.
- Laptop: paired BotConnector Local running **Device CLI `0.4.20`** with **`bccli >= 0.4.9`** installed and at least one model configured.
- Server: already live (relay `botconnector-device-relay.service`, Nginx `^~ /v1/client/devices` unbuffered, `account-api` allowlist `agent.*`).

Record each step's actual result (screenshot or text). A step with no evidence is `BELUM TERVERIFIKASI`, not PASS.

---

## 0. Prepare

1. Phone: install **2.1.0 (116)** from TestFlight, sign in (not guest).
2. Laptop: `npx https://app.botconnector.id/device-cli-launcher-v1.0.2.tgz connect` → confirms it pulls **0.4.20** and pairs.
3. Laptop: `bccli --version` → `0.4.9` or newer; `bccli` has a model configured.
4. Settings → **Agen (komputer)** visible (signed in) and **not** visible in guest mode.

## 1. Device gate (old CLI is not offered as usable)

- With a laptop on Device CLI `0.4.19` (or any build without the agent): open **Agen (komputer)** → the laptop row is **disabled** and shows the update hint with `npm i -g @botconnector/bccli`.
- Upgrade that laptop to `0.4.20`, refresh → the row becomes usable.

## 2. Session start

- Pick the laptop → **Sesi baru** → pick a folder → session screen opens and the stream shows `ready` (no error banner).
- Expected: within ~2 s the transcript shows the (empty) baseline, composer enabled.

## 3. Turn, approval and diff

- Prompt: `Read hello.txt and replace OLD with NEW using the edit tool, then read it again. Do not use bash.`
- Expected sequence in order: `thinking` (collapsible) → `tool` card `read` (ok) → **permission card** for `edit` with a diff preview → after **Izinkan sekali**: `tool` card `edit` (ok) with a diff block → `read` again → `result` text.
- File on the laptop really changed (`hello.txt` contains `NEW`).
- **Tolak**: repeat with a different file and press **Tolak** → the tool card ends as failed and the agent reports it was denied; the file is unchanged.
- **Izinkan sesi ini**: with a second edit in the same turn, no second card appears for the same tool.

## 4. Busy and cancel

- Send a prompt, then immediately send another → the second send is refused with the "still finishing" copy (not a silent failure).
- Start a long prompt and press **Hentikan** → the turn stops, the composer is usable again, no stuck spinner.

## 5. Stream resilience (the failure mode this feature must survive)

- While a turn is waiting on an approval, put the phone in airplane mode for ~10 s, then restore.
- Expected: the app reconnects by itself (watchdog 120 s max), reloads the baseline, and **the pending approval card reappears**; pressing an answer still works and the turn continues.
- Kill the app entirely and reopen → Settings → Agen → the last session is remembered; opening it re-attaches and replays the pending approval.

## 6. Capacity and honest errors

- Open the same session stream on a second phone (or a second app instance) until the account has 2 active streams, then try a third → `agent_capacity` copy: "Sudah ada dua sesi agen berjalan…".
- Stop `bccli` on the laptop (or uninstall) and send a prompt → `agent_runtime_missing` copy with `npm i -g @botconnector/bccli`, **never** a cloud fallback.
- Put `bccli` back at `0.4.8` temporarily → `agent_unsupported` copy with the update command.
- Turn the laptop off (or close BotConnector Local) and send → `device_offline` copy.

## 7. Attention banner and continue-last (2.1.0 build 116)

- Leave the agent session (close the sheet) while a turn waits on an approval → the app shows an in-app **banner** ("Agen butuh izin"); tapping it opens that session with the pending card, from any screen.
- Reopen **Agen (komputer)** after using a session → **Lanjutkan sesi terakhir** appears at the top and reopens it.
- Inside a session, the header button (panel icon) returns to the session list of the same computer.
- Note: this is an in-app banner, not a push notification. iOS push needs the Push Notifications capability on the App ID plus a regenerated provisioning profile — a separate, owner-approved step.

## 8. Privacy copy

- Agent screen shows the note that the agent runs on the computer and this session is not synced.

---

## Evidence to capture

| # | Step | Expected | Observed | Verdict |
|---|---|---|---|---|
| 1 | Old CLI gate | row disabled + hint | | |
| 2 | Session start | `ready`, no error | | |
| 3a | Approval + diff | card → diff in tool card, file changed | | |
| 3b | Deny | file unchanged, tool failed | | |
| 3c | Allow for session | no repeat card | | |
| 4a | Busy | refusal copy | | |
| 4b | Cancel | turn stops | | |
| 5a | Airplane mode mid-approval | reconnect + replayed approval | | |
| 5b | App restart | session restored, approval replayed | | |
| 6a | 3rd stream | `agent_capacity` | | |
| 6b | No runtime | `agent_runtime_missing` + install command | | |
| 6c | Old `bccli` | `agent_unsupported` | | |
| 6d | Laptop offline | `device_offline` | | |
| 7a | Banner while closed | banner opens pending session | | |
| 7b | Continue last | reopens remembered session | | |

Screenshots/text go in this file under a dated section once executed.
