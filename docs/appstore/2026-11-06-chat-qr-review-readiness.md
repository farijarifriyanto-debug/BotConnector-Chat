# BotConnector-Chat QR / App Review readiness

This is BotConnector-Chat (Expo), not BotConnector-Mobile/PocketPal. Owner corrected the intended application in this session. Both repositories share `id.botconnector.app`; a future upload must use this repository and a build number greater than every uploaded build (125 was uploaded from the other repository). Check App Store Connect before choosing the next number.

## Behavior and evidence

| Reference / approved design | Implementation | Evidence / limit |
|---|---|---|
| Small Bico, primary Connect AI, secondary local-model access | ConnectAiWelcome inside guest/no-model/empty chat | Component tests; native layout not yet observed |
| Existing conversations remain readable | Welcome condition includes zero messages; composer hidden only there | Code inspection; device verification pending |
| Kelivo QR import (`ai-provider:v1:` + base64 UTF8 JSON) | Independent parser; OpenAI-compatible supported; official Gemini mapped to existing compatible endpoint | Parser fixtures; no Dart code copied |
| Kelivo camera / gallery / text input | CameraView QR scanner, image picker + scanFromURLAsync, masked pasted configuration | Mocked native tests; actual physical QR scanning pending |
| Import configuration, then available models | Fill existing form, user connects, existing provider store fetches models and syncCustom updates picker | Existing provider tests; real provider request not run |
| Native Claude/OAuth Kelivo configurations | Explicit unsupported error; broken native Anthropic preset removed | Known deviation: full Kelivo protocol parity NOT claimed |
| QR imports account-independent configuration | No app plan, subscription, balance or purchase activation added | Code inspection |

## Release blockers / remaining audit

1. **3.1.1 payment / account flow:** App.tsx still leads into LoginScreen and guest access. SettingsSheet still exposes BotConnector/Apple sign-in; cloud capabilities, image/video and paid-plan copy remain. This change is not a BYOK-only conversion. Obtain original rejection and decide supported business flow before submission. Do not merely hide features from the reviewer.
2. **5.1.2(i) data sharing:** Provider privacy copy is disclosure, not an explicit recorded consent to share personal data with third-party AI. Audit all chat/file/search lanes and implement the appropriate consent before submission.
3. **2.1 reviewer access:** Provide a real bounded test key through App Store Connect (never git), sample compatible QR, real-provider chat instructions, and live reachable services. Test invalid key/offline/empty-model behavior.
4. **Native evidence:** iPhone + iPad camera permission, deny/retry, gallery, background/resume, large text, keyboard, model selection and streaming need native build/device checks. Windows Metro export proves JS bundling only, not an IPA or camera behavior.
5. **2.3 metadata:** Store screenshots must reflect the final native application, not the HTML design preview or PocketPal build. Update reviewer notes with QR semantics and supported protocols.

Sources checked 6 Nov 2026:
- https://developer.apple.com/app-store/review/guidelines/#in-app-purchase
- https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing
- https://apps.apple.com/us/app/kelivo/id6752122930 (listing 1.3.2; not proof master == released binary)
- https://github.com/Chevey339/kelivo/blob/master/lib/features/provider/widgets/import_provider_sheet.dart
- https://docs.expo.dev/versions/v57.0.0/sdk/camera/

## Local checks so far

Final after review fixes: **70 suites / 433 tests PASS**, typecheck PASS, focused source lint PASS. Final Metro export: `chat-qr-ios-bundle-final/_expo/static/js/ios/index-2aa46e50d0bcebc388bec34c6b23f49a.hbc` (3.4 MB). These are local checks, not App Review approval or physical-device verification.

- Full suite: 70 suites / 428 tests passed before final cancellation additions; final count recorded in handoff after review fixes.
- Typecheck passed after initial implementation.
- Metro iOS export successful (963 modules, Hermes bundle 3.4 MB); no signing/upload.
- Expo lint bootstrapped eslint + config because main had none. Initial run: 36 errors / 18 warnings across source, including three newly introduced errors now corrected. New provider/scanner/welcome/parser lint passes. Existing React compiler lint findings are not silently suppressed; see final baseline comparison.
- A concurrent Metro export caused the first provider-sheet test to exceed Jest's default 5 seconds; isolated repeat passed all five tests.
- Jest rootDir testMatch breaks under the Windows `.local` worktree path; command override `--testMatch '**/__tests__/**/*.test.ts?(x)'` finds tests without weakening assertions.

## Independent review and corrections

Fresh reviewer found three Important issues, each reproduced by a failing test before fixes:
- Native `atob` dependency: replaced with existing base64ToBytes helper; test removes global atob.
- Permission recovery: scanner rechecks permission on foreground after device Settings; test captures AppState callback.
- Credential destination switch: changing presets clears the key and disables preset changes during save; test imports an OpenAI key then selects OpenRouter.

Reviewer Minor (deferred): broader integration coverage for ChatScreen history/composer gating, full QR-to-real-store-save-to-picker, scanFromURLAsync's second-await cancellation, captured callbacks after unmount, and save-failure retry. Initial picker-await cancellation and gallery-success coverage already exist; tests are not a substitute for native E2E.

Final lint comparison used identical new Expo lint config against an archived origin/main and this branch: both have **34 errors / 58 warnings**, same file/rule/severity list. Changed provider/editor/scanner/decoder/welcome files lint clean; main already contains the ChatScreen React compiler violations. Repo-wide lint is still not green. Lockfile audit: no existing dependency versions changed; 238 package paths added by camera and lint tooling; root lock version corrected from stale 2.0.0 to package version 2.1.0.

Rulings: explicit unsupported Claude/OAuth instead of false compatibility; existing native modal patterns kept (no routing rewrite); existing cloud/login flows not removed without resolving the original review rejection; no device/approval claim from unit tests or Metro. Costs: protocol support is partial, App Review work remains, and visual acceptance still needs device proof.
