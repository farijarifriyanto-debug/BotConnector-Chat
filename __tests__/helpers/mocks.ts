// Native modules the unit tests cannot load; imported first by every UI test.
jest.mock('expo-sqlite/kv-store', () => { const m = new Map<string, string>(); return { __esModule: true, default: { getItemSync: (k: string) => m.get(k) ?? null, setItemSync: (k: string, v: string) => { m.set(k, v) }, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v) } } } })
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }))
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)), randomUUID: () => require('crypto').randomUUID() }))
export {}
