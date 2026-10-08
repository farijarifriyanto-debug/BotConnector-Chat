import { fetch } from 'expo/fetch'
import { ACCOUNT_BASE } from '../api/config'

export const REPORT_EMAIL = 'admin@botconnector.id'
export const REASONS = ['harmful', 'sexual', 'hate', 'wrong', 'privacy', 'other'] as const
export type Reason = (typeof REASONS)[number]
const LABEL: Record<Reason, string> = { harmful: 'Harmful or illegal', sexual: 'Sexual or violent', hate: 'Hateful or harassing', wrong: 'False or misleading', privacy: 'Privacy violation', other: 'Other' }

export interface Report { reason: Reason; note: string; reply: string; prompt: string; model: string; hasImage: boolean; app: string }
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

/** One text a person on the support team can read: what was reported, by which model, and what the user said about it. */
export function reportText(r: Report): string {
  return [
    `Content report from the BotConnector app (${r.app})`, `Reason: ${LABEL[r.reason]}`, `Model: ${r.model || 'unknown'}`, `Time: ${new Date().toISOString()}`,
    ...(r.note.trim() ? [`Note: ${cut(r.note.trim(), 500)}`] : []),
    ...(r.prompt.trim() ? ['', '--- Question ---', cut(r.prompt.trim(), 2000)] : []),
    '', '--- Reply ---', r.reply.trim() ? cut(r.reply.trim(), 6000) : (r.hasImage ? '(a picture; the picture itself is not sent)' : '(empty)'),
  ].join('\n')
}
export const reportSubject = (r: Report) => `[Content report] ${LABEL[r.reason]}`

/** Email to the support address, for someone without an account or when the form is unreachable. Kept short: mail apps cap the link length. */
export const reportMailto = (r: Report): string => `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(reportSubject(r))}&body=${encodeURIComponent(cut(reportText({ ...r, reply: cut(r.reply, 1500), prompt: cut(r.prompt, 500) }), 3000))}`

export type ReportFailure = 'rate' | 'invalid' | 'down' | 'network'
export class ReportError extends Error { constructor(public reason: ReportFailure) { super(reason); Object.setPrototypeOf(this, new.target.prototype) } }

/** Sends the report as a support ticket (the same desk as the website's Help page). Returns the reference number. */
export async function sendReport(who: { name: string; email: string }, r: Report): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${ACCOUNT_BASE}/support`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ requester_name: cut(who.name, 120), requester_email: who.email, category: 'OTHER', product_context: `App content report (${r.app})`, subject: reportSubject(r), message: reportText(r) }),
    })
  } catch { throw new ReportError('network') }
  const j = await res.json().catch(() => null) as { success?: boolean; reference?: string } | null
  if (res.status === 429) throw new ReportError('rate')
  if (res.status === 400) throw new ReportError('invalid')
  if (!res.ok || !j?.success) throw new ReportError('down')
  return String(j.reference ?? '')
}
