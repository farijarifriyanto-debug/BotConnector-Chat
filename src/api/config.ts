/** Where the app talks to. Everything is served by the same BotConnector backend the web Chat uses. */
export const API_BASE = 'https://api.botconnector.id'      // Cloud API: models, chat, web search, files, devices (Bearer access token)
export const ACCOUNT_BASE = 'https://botconnector.id'       // login, native session, account deletion
export const WEB_BASE = 'https://app.botconnector.id'       // account-synced chats, projects, memory, share links
export const NATIVE_CLIENT_ID = 'botconnector-mobile'
export const NATIVE_CALLBACK = 'botconnector://auth/callback'
