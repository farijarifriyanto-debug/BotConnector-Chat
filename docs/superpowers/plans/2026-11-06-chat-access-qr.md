# Chat Access and QR Implementation Plan

> **For agentic workers:** Use executing-plans for inline execution, with a fresh final code review.

**Goal:** Implement the approved BotConnector-Chat start surface and functional provider QR import.
**Architecture:** Existing ChatScreen and ProvidersSheet; pure decoder; focused scanner component; reuse provider store and SecureStore.
**Tech Stack:** Expo SDK 57, React Native 0.86, Zustand, expo-camera, expo-image-picker, Jest.
**Spec:** `docs/superpowers/specs/2026-11-06-chat-access-qr.md`

## Global Constraints
- Correct repo is BotConnector-Chat, base origin/main bfdc483; independent worktree.
- No raw key/payload logging or keys in persistent non-secure configuration.
- No payment or premium activation via QR; no release dispatch.
- Expo SDK57 documentation required before API use.

## Review Focus
- Stale async gallery/scan completion after cancellation must not populate or save a hidden form.
- QR destination must not silently change through normalization, especially query, credentials or protocol.
- Repeated camera scan callbacks must be consumed once.
- Native Claude/OAuth QR cannot masquerade as OpenAI-compatible success.
- New-user flow must not hide history or prevent choosing an already configured model.

## Tasks / progress

Execution record: core tasks 1–3 implemented and component-tested. Fresh review completed with three Important fixes verified RED→GREEN. Final suite **433/433 across 70 suites**, typecheck PASS, new-component ESLint PASS; repo-wide lint has 34 pre-existing errors/58 warnings reproduced on origin/main. iOS Metro export PASS, not a native archive. Detailed rulings, remaining native/integration checks and App Review blockers: `docs/appstore/2026-11-06-chat-qr-review-readiness.md`. NOT DONE for shipping: no native camera/visual proof, no push/PR/merge or release authorized in this turn.

### 1. Decoder
- [ ] Add `__tests__/provider-import.test.ts` for valid UTF8 OpenAI/Gemini, missing key, malformed/oversized/base64/type/URL and unsupported protocol.
- [ ] Observe failure, implement `src/lib/providerImport.ts`: `decodeProviderImport(raw: string): ProviderImport`, constant `ProviderImportError.code`.
- [ ] Run parser suite; existing provider/custom API baseline.

### 2. Scanner and provider entry
- [ ] Install SDK-compatible expo-camera with Expo CLI; add plugin permission including QR and existing photo use, recordAudioAndroid false.
- [ ] Add `src/components/ProviderQrScanner.tsx` (onScan, onCancel), useCameraPermissions, QR-only CameraView, AppState cleanup, one-shot read.
- [ ] Add scanner behavior tests before implementation.
- [ ] Integrate choices + gallery/text import into ProvidersSheet, localized messages/labels, async cancellation protection and reused save/model synchronization.
- [ ] Test imports/no key/error/cancel and real provider store payload flow with mocked transport.

### 3. Approved start surface
- [ ] Add `ConnectAiWelcome.tsx`, wire guest/no-model empty state, adjust header/composer visibility to match mockup while preserving existing conversations.
- [ ] Use common theme/system type and existing Bico asset. Test callback routing and fresh/connected/history states.

### 4. Verify and audit
- [ ] Run typecheck, full Jest and lint on changed source; production bundle if available.
- [ ] Fresh code review and fix material findings.
- [ ] Record reference matrix, native verification limitations and App Review gaps in docs.
- [ ] Commit on feature branch. Request authorization for push/PR/merge/release as applicable; do not conflate local tests with delivery.
