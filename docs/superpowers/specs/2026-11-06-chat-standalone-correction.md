# Correction: standalone BYOK belongs in BotConnector-Chat

Status: revised scope, 6 Nov 2026 (revision 2). Revision 1 assumed removal of all account-only feature entry points; the owner did **not** approve that. This revision replaces blanket removal with provider/local redirection, following the verified Kelivo reference. Awaiting owner confirmation before implementation.

Legend: **[OWNER]** = explicit owner decision. **[PROPOSAL]** = agent proposal, not yet approved.

## Authority and intended outcome

- **[OWNER]** Correct product: `farijarifriyanto-debug/BotConnector-Chat`, Expo SDK57. Not BotConnector-Mobile/PocketPal.
- **[OWNER]** Preserve the approved Bico/green Chat UI and existing local data. Fresh install opens the app without a BotConnector/Apple login.
- **[OWNER]** Adding a provider manually or by compatible QR makes its models selectable (PR #15 slice, already built).
- **[OWNER]** Do **not** remove Image/Video/speech/file/laptop capabilities wholesale. Owner explicitly questioned the removal because Kelivo ships similar features. Capabilities must be preserved through BYOK providers or on-device processing.
- App Review readiness is a release requirement, not a promise of approval.

## Kelivo reference facts (verified from source, master @ 28f2956)

These facts bound what "parity" means. Do not claim more than this.

- Kelivo has no app account of its own; provider keys or optional provider logins only.
- Images: provider config baseUrl + `/images/generations` / `/images/edits`, using the user's key. Viable pattern for a BYOK image adapter.
- ASR: system speech, Sherpa offline, or cloud provider via the user's key. Cloud ASR does not require a BotConnector account.
- Documents: PDF/DOCX text extracted on-device (background isolate); native attachments per protocol/model. Extracted text may still be sent to a cloud AI — do not claim fully private/local processing.
- Workspace: Linux sandbox on mobile, native shell on desktop. **No evidence of phone→laptop pairing equivalent to the BotConnector relay.** Direct laptop pairing is our own proposal and needs a separate study.
- Video generation equivalent to Studio was **not found** in the examined README/file inventory. Do not equate video input with video generation, and do not claim the feature definitely does not exist.
- Backup: local/WebDAV/S3 mentioned in README. Chat currently has local/WebDAV; do not claim S3.
- Kelivo is AGPL-3.0. QR was written independently. Do not copy Dart implementations without a license decision.

## Approach [PROPOSAL]

Remove the account/login dependency from the shipped app; keep every user-facing capability by rerouting it to (a) a user-configured BYOK provider, (b) on-device processing, or (c) an explicit, labelled unavailable state when neither exists yet. Never silently fall back to BotConnector Cloud. Do not wrap login in a guest default or hide account controls while session restoration and network fallbacks keep running.

Alternatives considered:
- Default to guest and retain login: rejected; can silently restore Cloud behavior on upgrade.
- Switch to the PocketPal fork: explicitly rejected by owner.
- Remove all account-only features (revision 1): rejected by owner.

## Required changes

### 1. Start and migration [OWNER]

- App.tsx mounts the standalone chat after local initialization; remove LoginScreen, AppleSignupSheet, account refresh on foreground and account-oriented onboarding from the shipping import graph.
- Delete only the old session credential `bc.session.v1`; disable account sync metadata without deleting chats. Never call `useAuth.logout` or account deletion helpers: `src/store/auth.ts:115-125` calls clearConvs.
- Keep existing SQLite conversations, provider configs and `bc.pk.*` credentials, local models, memory, preferences and backups. Migration must be retryable without data loss.
- Historical cloud-model conversations remain readable; sending requires selecting an available BYOK/local model with a clear message, never silently sending to a different provider.
- Startup must not fetch Cloud catalog/account/usage/media/capabilities automatically.

### 2. Model and transport layer [OWNER direction, PROPOSAL detail]

- Model list consists of user-added providers and local models; no automatic `/v1/models`, `/v1/catalog`, `/v1/media/models`, `/v1/client/capabilities`, usage/balance/account calls to BotConnector.
- BotConnector may be manually configured as an ordinary OpenAI-compatible provider. No entitlement, wallet or package activation via QR. No silent inheritance of the old session or account plan.
- Preserve QR from #15. Native Anthropic transport is an explicit gap in #15: add native model-list/messages transport and a protocol field instead of importing unsupported configs as OpenAI. Keep Gemini's documented OpenAI-compatible transport. Test streaming text/reasoning/tools/images/error/cancel per protocol.

### 3. Search and reading [OWNER direction, PROPOSAL detail]

- Remove BotConnector Search as default and as silent fallback; Brave/Tavily/Exa/Parallel keys are the authoritative routes. Missing key, empty results and failure are distinct, visible states (fixes audit E4).
- Page reading: route through the user's configured reader (Tavily/Exa) or be off with an explanation. No server-backed path labelled "local" (fixes audit E2).
- Research uses those same choices, honours reading-off and cancellation, and is available only when configured.

### 4. Capability redirection (replaces revision-1 removal) [OWNER direction, PROPOSAL detail]

Order follows Kelivo-proven feasibility first. Each item needs its own adapter scope before implementation; nothing in this section is built yet.

| # | Capability | Redirection plan | Reference | Status |
|---|---|---|---|---|
| F1 | Image generation | BYOK adapter: provider baseUrl + `/images/generations` (and `/images/edits` where the provider supports it), user's key. Keep Cloud path only while account features exist; label state honestly | Kelivo `openai_images.dart` pattern | scoped here, not scheduled |
| F2 | Speech-to-text (ASR) | Three tiers like Kelivo: OS system speech → on-device (Sherpa-class) → cloud provider with user's key. No BotConnector-account requirement | Kelivo `cloud_asr_service.dart` | scoped here, not scheduled |
| F3 | Files/documents | On-device extraction (PDF/DOCX, background isolate equivalent) + attach extracted text/native attachment per model protocol. Works for every BYOK/local model; remove the fileIds-dropping gap for custom/local models (audit inventory) | Kelivo `document_text_extractor.dart`, `native_input_attachments.dart` | scoped here, not scheduled |
| F4 | Video generation | No Kelivo parity found. Either keep as explicit BotConnector-Cloud-only feature behind login (if login survives in any form), or mark unavailable with honest copy. **Needs a separate owner decision; do not improvise parity** | none | OPEN DECISION |
| F5 | Laptop relay / pairing | No Kelivo equivalent verified. Direct phone→laptop pairing is our own proposal and needs a dedicated study (protocol, security, UX). Until decided, the entry point must not claim a working capability | none | OPEN DECISION |
| F6 | Project files uploaded to server | Server upload is account-bound. Standalone mode: local projects/instructions only; uploaded-file history stays readable where stored locally. No silent upload attempts as guest | audit inventory | scoped here, not scheduled |

### 5. Settings and account-only surfaces

- Remove account login/Apple registration, plan/quota/wallet, usage, logout, account deletion and account sync from this app's UI and shipping runtime.
- Group Settings like the verified Kelivo source: General; Models & Services; Data; About — with search and current-value summaries. Place provider/local/search access prominently (fixes audit U1–U3).
- Keep language, theme, font controls, local assistants, standing instructions, World Book, phrases, statistics, translation, local backup and WebDAV.
- Keep OS text-to-speech. Every control must reflect actual provider/model capability (fixes audit E3/E7).

### 6. Engine consistency from audit [required before release]

- E1: enforce the effective tool-name allowlist at dispatch, not just in the definitions sent to the model.
- E2/E4: honest search/reader routing and visible failure states (section 3).
- E3: explicit/verified per-model capability metadata; UI offers only what works. Do not set universal true flags without evidence.
- E5: one effective thinking setting per call, including local inference; resolve the composer-vs-local-params conflict with a single priority rule tested down to llama.rn parameters.
- E6: translation settings either apply to every translate action or state their scope explicitly.
- E7: shared memory capacity constants; copy matches actual tool behavior.
- E8: backup uses the native-safe base64 helpers (`src/lib/bytes.ts`); no browser globals assumed; verify on Hermes/device.

### 7. Privacy and reviewer access [OWNER]

- Explicit disclosure and permission before sending personal data to the selected AI provider (5.1.2(i)); integrate at the first-send boundary, not repetitive per-message confirmation. Changing the recipient must re-trigger disclosure.
- Privacy labels, support/legal pages, localization and review notes must match shipped behavior. Supply a real bounded test key and QR via App Store Connect only; never commit credentials.
- Review the actual Apple rejection text before final submission. Explain the real business model; relabelling to "BYOK" does not automatically satisfy 3.1.1.

## Acceptance / verification

1. Clean install and upgrade: no login, zero unsolicited BotConnector account/cloud requests. Existing chats and provider keys retained; migration retryable.
2. Settings/search/model-picker/source audit finds no active account-only entry points. Historical chats with missing models are readable and prompt model selection on send.
3. Manual/QR provider → model fetch → selection → real streaming chat; invalid key/no models/offline/abort/retry, iPhone and iPad.
4. Runtime network trace proves custom/local chats, search and page reading follow the selected recipients; local mode never falls back to Cloud.
5. Native backup roundtrip and migration verified against a copy of existing data (Hermes, not Node).
6. Each shipped capability (F1–F3 at minimum) demonstrated against a real BYOK provider key or on-device path; F4/F5 either demonstrably working or honestly labelled.
7. Native screenshots show the approved style for welcome/provider plus the separately reviewed Settings layout. Unit mocks and HTML previews are not E2E evidence.
8. Fresh review, unit/integration tests, typecheck, lint baseline, native archive, then PR/merge and authorized TestFlight build from main. Shared bundle ID requires checking the latest uploaded build number immediately before upload.

This document is a corrected plan, not a completed fix. No code changes are authorized by it beyond what the owner approves per session.
