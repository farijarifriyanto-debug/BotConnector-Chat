import { isChat } from './conv'
import type { Conv } from './types'

/** The reference app's statistics ranges (custom ranges are not ported). */
export type RangePreset = 'all' | '30d' | 'lastMonth' | 'lastQuarter'
export interface Range { start?: number; end?: number }
export interface DayCount { day: string; count: number }
export interface RankRow { label: string; value: number }
export interface StatsSnapshot {
  conversations: number
  messages: number
  answers: number
  heatmap: DayCount[]
  trend: DayCount[]
  models: RankRow[]
  topics: RankRow[]
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Local-midnight boundaries, like the reference app's date ranges; end is exclusive. */
export function rangeFor(preset: RangePreset, now: Date = new Date()): Range {
  const end = midnight(addDays(now, 1))
  switch (preset) {
    case '30d': return { start: midnight(addDays(now, -29)), end }
    case 'lastMonth': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), end: new Date(now.getFullYear(), now.getMonth(), 1).getTime() }
    case 'lastQuarter': {
      const q = Math.floor(now.getMonth() / 3)
      return { start: new Date(now.getFullYear(), (q - 1) * 3, 1).getTime(), end: new Date(now.getFullYear(), q * 3, 1).getTime() }
    }
    default: return {}
  }
}

/**
 * Everything the app can count from the chats stored on this device: chats, messages,
 * answers, the 365-day heatmap, the daily trend and the model/topic ranks. Tokens and
 * cost are not kept locally (see the parity notes).
 */
export function computeStats(convs: Conv[], preset: RangePreset, now: Date = new Date()): StatsSnapshot {
  const range = rangeFor(preset, now)
  const chats = convs.filter(isChat)
  const inRange = (t: number) => (range.start === undefined || t >= range.start) && (range.end === undefined || t < range.end)

  const dayCounts = new Map<string, number>()
  for (const c of chats) for (const m of c.messages) {
    if (!Number.isFinite(m.createdAt)) continue
    const key = dayKey(new Date(m.createdAt))
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1)
  }

  let messages = 0, answers = 0
  const models = new Map<string, number>(), topics = new Map<string, { label: string; value: number }>()
  for (const c of chats) {
    const title = c.title?.trim()
    for (const m of c.messages) {
      if (!inRange(m.createdAt)) continue
      messages++
      if (m.role === 'assistant') {
        answers++
        const label = m.model?.trim() || '—'
        models.set(label, (models.get(label) ?? 0) + 1)
      }
      if (title) {
        const row = topics.get(c.id) ?? { label: title, value: 0 }
        row.value++
        topics.set(c.id, row)
      }
    }
  }

  const heatmap = Array.from({ length: 365 }, (_, i) => {
    const day = dayKey(addDays(now, i - 364))
    return { day, count: dayCounts.get(day) ?? 0 }
  })

  // All time shows the last 30 days, otherwise every day of the chosen range (reference app).
  const trendStart = range.start !== undefined ? new Date(range.start) : addDays(now, -29)
  const trendEnd = range.end !== undefined ? new Date(range.end) : addDays(now, 1)
  const trend: DayCount[] = []
  for (let d = new Date(trendStart.getFullYear(), trendStart.getMonth(), trendStart.getDate()); d.getTime() < trendEnd.getTime(); d = addDays(d, 1)) {
    const day = dayKey(d)
    trend.push({ day, count: dayCounts.get(day) ?? 0 })
  }

  const rank = (rows: RankRow[]) => rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  return {
    conversations: chats.filter(c => inRange(c.createdAt)).length,
    messages,
    answers,
    heatmap,
    trend,
    models: rank([...models.entries()].map(([label, value]) => ({ label, value }))),
    topics: rank([...topics.values()]),
  }
}
