/** Time left until a window frees up: whole days, hours and minutes (never "0m" for something still counting down). */
export function timeLeft(iso: string | null | undefined, now = Date.now()): { d: number; h: number; m: number } | null {
  const at = iso ? Date.parse(iso) : NaN; if (!Number.isFinite(at)) return null
  const mins = Math.max(1, Math.ceil((at - now) / 60000))
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 }
}
/** Balance as the server states it: amounts come in millionths of the account currency. */
export function money(micros: number, currency: string): string {
  const v = micros / 1e6, zero = /^(IDR|JPY|KRW|VND)$/i.test(currency)
  return `${currency.toUpperCase()} ${v.toLocaleString('en-US', { minimumFractionDigits: zero ? 0 : 2, maximumFractionDigits: zero ? 0 : 2 })}`
}
export const barColor = (pct: number) => (pct >= 95 ? 'danger' : pct >= 80 ? 'payg' : 'accent') as 'danger' | 'payg' | 'accent'
