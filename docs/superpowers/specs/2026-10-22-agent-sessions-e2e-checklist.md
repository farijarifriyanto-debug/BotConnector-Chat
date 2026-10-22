# Agent Sessions â€” Real-Device E2E Checklist (2.1.0)

Status: **required before release** (spec Â§10). Unit tests do not count as E2E evidence.

- App build: **2.1.0 (build 115)**, TestFlight, branch `feat/agent-sessions-phone-20261022`.
- Laptop: paired BotConnector Local running **Device CLI `0.4.20`** with **`bccli >= 0.4.9`** installed and at least one model configured.
- Server: already live (relay `botconnector-device-relay.service`, Nginx `^~ /v1/client/devices` unbuffered, `account-api` allowlist `agent.*`).

Record each step's actual result (screenshot or text). A step with no evidence is `BELUM TERVERIFIKASI`, not PASS.

---

## 0. Prepare

1. Phone: install **2.1.0 (115)** from TestFlight, sign in (not guest).
2. Laptop: `npx https://app.botconnector.id/device-cli-launcher-v1.0.2.tgz connect` â†’ confirms it pulls **0.4.20** and pairs.
3. Laptop: `bccli --version` â†’ `0.4.9` or newer; `bccli` has a model configured.
4. Settings â†’ **Agen (komputer)** is visible (signed in) and **not** visible in guest mode.

## 1. Device gate (old CLI is not offered as usable)

- With a laptop on Device CLI `0.4.19` (or any build without the agent): open **Agen (komputer)** â†’ the laptop row is **disabled** and shows the update hint with `npm i -g @botconnector/bccli`.
- Upgrade that laptop to `0.4.20`, refresh â†’ the row becomes usable.

## 2. Session start

- Pick the laptop â†’ **Sesi baru** â†’ pick a folder â†’ session screen opens and the stream shows `ready` (no error banner).
- Expected: within ~2 s the transcript shows the (empty) baseline, composer enabled.

## 3. Turn, approval and diff

- Prompt: `Read hello.txt and replace OLD with NEW using the edit tool, then read it again. Do not use bash.`
- Expected sequence in order: `thinking` (collapsible) â†’ `tool` card `read` (ok) â†’ **permission card** for `edit` with a diff preview â†’ after **Izinkan sekali**: `tool` card `edit` (ok) with a diff block â†’ `read` again â†’ `result` text.
- File on the laptop really changed (`hello.txt` contains `NEW`).
- **Tolak**: repeat with a different file and press **Tolak** â†’ the tool card ends as failed and the agent reports it was denied; the file is unchanged.
- **Izinkan sesi ini**: with a second edit in the same turn, no second card appears for the same tool.

## 4. Busy and cancel

- Send a prompt, then immediately send another â†’ the second send is refused with the "still finishing" copy (not a silent failure).
- Start a long prompt and press **Hentikan** â†’ the turn stops, the composer is usable again, no stuck spinner.

## 5. Stream resilience (the failure mode this feature must survive)

- While a turn is waiting on an approval, put the phone in airplane mode for ~10 s, then restore.
- Expected: the app reconnects by itself (watchdog 120 s max), reloads the baseline, and **the pending approval card reappears**; pressing an answer still works and the turn continues.
- Kill the app entirely and reopen â†’ Settings â†’ Agen â†’ the last session is remembered; opening it re-attaches and replays the pending approval.

## 6. Capacity and honest errors

- Open the same session stream on a second phone (or a second app instance) until the account has 2 active streams, then try a third â†’ `agent_capacity` copy: "Sudah ada dua sesi agen berjalanâ€¦".
- Stop `bccli` on the laptop (or uninstall) and send a prompt â†’ `agent_runtime_missing` copy with `npm i -g @botconnector/bccli`, **never** a cloud fallback.
- Put `bccli` back at `0.4.8` temporarily â†’ `agent_unsupported` copy with the update command.
- Turn the laptop off (or close BotConnector Local) and send â†’ `device_offline` copy.

## 7. Approval notification and continue-last (2.1.0 build 116)

- Put the phone to sleep / switch to another app while a turn waits on an approval → a local notification appears once per request; tapping it opens that session with the pending card.
- Reopen **Agen (komputer)** after using a session → **Lanjutkan sesi terakhir** appears at the top and reopens it.
- Inside a session, the header button (panel icon) returns to the session list of the same computer.

## 8. Privacy copy

- Agent screen shows the note that the agent runs on the computer and this session is not synced.

---

## Evidence to capture

| # | Step | Expected | Observed | Verdict |
|---|---|---|---|---|
| 1 | Old CLI gate | row disabled + hint | | |
| 2 | Session start | `ready`, no error | | |
| 3a | Approval + diff | card â†’ diff in tool card, file changed | | |
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

Screenshots/text go in this file under a dated section once executed.
