# App Store Review Notes — BotConnector 2.1.0 (build 129)

Source: this repository (BotConnector-Chat, Expo). Upload number 129; 126 and 127 came from the same
code line, 128 and 125 are from a different repository and must not be selected for review.

## What changed since 2.0.0 (the build that was rejected)

BotConnector is now a standalone **bring-your-own-key (BYOK)** AI chat client.

- **Guideline 3.1.1.** There is **no BotConnector account, no sign-in, no balance, no credits, no plan and
  no in-app purchase**. Nothing is sold in the app, no price is shown, and the app does not give access to
  any subscription or credits that BotConnector sells elsewhere: no preset, link or login leads to one.
  The Video Studio screen, the usage screen and the sign-in screens are gone. A person who used 2.0.0 keeps
  their chats; the old account session is dropped on first launch.
- **Providers.** The user connects an AI provider they already use (OpenAI, Anthropic Claude, Google
  Gemini, xAI, Mistral, DeepSeek, OpenRouter and similar, or a local server such as Ollama) with **their own
  API key**. The app talks **directly from the phone to that provider**. BotConnector does not proxy,
  store or bill this traffic.
- **Keys** are stored only in the iOS Keychain (via expo-secure-store), never in logs or analytics.
  Removing a provider deletes its key.
- **Data-sharing agreement (5.1.2(i)).** Before the first provider can be saved, the app shows that the
  person's messages and any files or images they attach are sent from the device to that provider and that
  the provider's own privacy policy applies, and requires a tick to continue. The agreement is remembered
  after the provider is saved.
- **Camera.** Used only to take photos the person attaches to a chat. QR import of providers is switched
  off in this version.

## Region change (Guideline 5, China)

China mainland has been **removed from App Store distribution** in App Store Connect (Availability), so
this version is not offered there. The references to OpenAI, ChatGPT and GPT in the metadata therefore apply
only to storefronts outside China, where the app lets people connect providers they already use.

## Steps for the reviewer

1. Launch the app. On the empty chat screen tap **Connect AI** (or open **Settings → Providers**).
2. Choose **Enter an API key**.
3. Pick the **OpenAI** preset under **Quick start**.
4. Paste the limited test key: `[LIMITED-TEST-API-KEY]` (a real, rate-limited key is supplied with the
   submission in App Review Information; it is never part of the repository).
5. Tick the data-sharing agreement, then tap **Connect and load models**.
6. Open the model picker in the chat header, choose a loaded model and send `Hello`. The answer streams
   from the provider.

Error path: an invalid key gives an in-app message and saves nothing. A provider that returns no models
gives guidance instead of an error.

## Notes for the reviewer

- No demo account is needed because there is no account system.
- **On-device models** can be downloaded under **Settings → Local models** if you prefer not to use a
  remote key; no network credential is needed for that path.
- The test key is scoped to the review period and can be rotated by us without an app update.
- Not verified on a physical device at the time of writing: the upgrade from 2.0.0 and iPad layout. Device results are recorded separately before submission.
