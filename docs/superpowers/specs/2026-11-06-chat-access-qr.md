# BotConnector Chat: approved access design and QR import

## Intent and approval

Owner confirmed BotConnector-Chat (Expo), not the PocketPal fork; approved the three-screen mockup with “sesuai”, asked to prioritize App Review, retained QR after verifying Kelivo, then said “ok lanjutkan”. This document records that visual/feature decision. It does not authorize an upload or promise Apple approval.

Base: origin/main bfdc483. Existing checkout has unrelated agent work; use the isolated chat-qr-professional-ux worktree. Mockup source: original checkout `.superpowers/brainstorm/59222-1793968191/content/chat-access-v1.html`.

## Approach

Keep the existing Expo application and provider store. Improve the guest/no-model start screen with a smaller Bico, one Connect AI action, secondary local-model access, and no unusable composer. Add connection choices inside the existing provider sheet (camera QR, image QR, pasted configuration, manual key). Preserve normal chat interaction and theme colors. No PocketPal code or new navigation framework: these are existing screen contents and modal states, not new navigation routes.

Alternatives: manual-only access loses the requested convenience; replacing this application with PocketPal is explicitly rejected; a one-time-code backend is unnecessary for the Kelivo configuration format. Camera + image + pasted configuration use the same decoder and editable provider form.

## Reference and adaptations

- Kelivo official `lib/features/provider/widgets/import_provider_sheet.dart` on master, inspected 6 Nov 2026: `ai-provider:v1:` plus UTF-8 base64 JSON with type/name/apiKey/baseUrl. Camera, gallery and pasted-text import. Source: https://github.com/Chevey339/kelivo/blob/master/lib/features/provider/widgets/import_provider_sheet.dart . Independent implementation, no Dart copied.
- Kelivo saves the decoded config without fetching models. Our existing store fetches models on add: scanned configuration therefore fills the existing form, exposing destination and masked key, and the user uses the same Add action. No second security wizard. This is an adaptation to the existing store, disclosed here.
- Initial transport supports OpenAI-compatible servers. `openai` QR supported; `google` translated to Google's OpenAI-compatible endpoint while preserving the key, matching our existing Gemini preset; `claude`/`oauth` receive explicit unsupported-protocol messages rather than being silently misrouted. Full native Claude transport is a separate functional gap.
- Imported key may be empty: show the form, do not claim it is connected. Models fetched from the selected endpoint on save, then synchronized into the existing picker.

## Behavior contract

1. Guest without a model sees the approved small-Bico start surface and one Connect AI CTA; local access remains. Existing conversations remain readable. Composer remains usable in existing conversations and once a model exists.
2. Provider sheet opens to connection options when empty; saved providers remain visible when populated. Add opens options. Manual entry remains possible. Common provider preset fills name and URL.
3. QR camera permission is requested only after selecting scan. Denial offers Settings or retry and manual/paste alternatives. Camera unmounts on background, modal close, success, or moving to another mode. Repeated callbacks cannot import twice.
4. Gallery uses the existing image picker and Expo camera scanFromURLAsync. Cancellation is silent; unreadable QR is an actionable localized error.
5. Parser checks prefix/base64/UTF-8/JSON/types, bounds input size, accepts HTTPS and existing private-network HTTP rules, rejects URL credentials/query/fragment (no silent endpoint mutation), never logs input or key. Bad payloads produce constant error codes.
6. Connection form labels remain visible. Key stays masked. Imported values are cleared on close. Save failure keeps the form. Close/back cannot dispatch an import after cancellation.
7. No QR unlocks an app tier, package, wallet or payment. Existing account/cloud functionality is an App Review audit item, not silently removed by this UI task.

## Visual tokens

Existing theme: dark bg #0a0c0e, surface #12151a, ink #f3f6f4, muted #9aa6a0, accent #4fdca0; light bg #f3f6f4, white surface, ink #0f1a15, accent #0d7f55. System font; headings 26–29, body 15/22; touch targets >=44; content max width 440 for setup and existing 760 for chat. No fixed text heights; large-text/landscape scrollable. Accessible labels and clear actions in Indonesian and English, existing fallback for other languages.

## Verification / release boundary

Parser tests with actual Kelivo-format fixtures, native mocked UI tests for scan cancellation/error/import, store integration tests for key isolation and model loading, typecheck/lint/full tests. Native camera and device visuals need iPhone/iPad or Android dev build; mockup and mocks do not prove them. App Review audit records remaining account/payment/privacy gaps and requires original rejection and real device testing before submission. No release or merge implied.
