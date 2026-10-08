# BotConnector Chat

Native iOS/Android app (React Native + Expo) for BotConnector Chat: same models, Web search, Deep research with citations and table charts as https://app.botconnector.id/workspace/chat/.

- Sign-in: browser PKCE flow (`botconnector-mobile` client) → session in the OS secure store.
- Chats: stored on the device (SQLite).
- Models/search/chat: `https://api.botconnector.id` with the account's own key.

```
npm ci
npx tsc --noEmit && npx jest
npx expo start          # needs a dev build or Expo Go for a device
```

TestFlight: Actions → "iOS TestFlight" (secrets: `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APP_STORE_CONNECT_API_KEY_CONTENT`, `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_ISSUER_ID`).
