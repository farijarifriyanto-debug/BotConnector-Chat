// Native modules the unit tests cannot load; imported first by every UI test.
jest.mock('expo-sqlite/kv-store', () => { const m = new Map<string, string>(); return { __esModule: true, default: { getItemSync: (k: string) => m.get(k) ?? null, setItemSync: (k: string, v: string) => { m.set(k, v) }, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v) } } } })
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }))
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)), randomUUID: () => require('crypto').randomUUID(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_a: string, s: string) => require('crypto').createHash('sha256').update(s).digest('hex'),
}))
// Sign in with Apple: the native sheet is replaced; tests set signInAsync's result per case.
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true), signInAsync: jest.fn(), formatFullName: (n: { givenName?: string; familyName?: string }) => [n?.givenName, n?.familyName].filter(Boolean).join(' '),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 }, AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 }, AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
  AppleAuthenticationButton: (p: { testID?: string; onPress: () => void }) => { const { Pressable } = require('react-native'); return require('react').createElement(Pressable, { testID: p.testID, onPress: p.onPress, accessibilityRole: 'button' }) },
}))
jest.mock('react-native-webview', () => ({ WebView: () => null }))
export {}
