import type { ForecastPeriod } from '../api'
import { taiwanDay } from '../i18n'

export function chartExtent(points: { v: number }[], bars = false) {
  const min = Math.min(...points.map((p) => p.v)), max = Math.max(...points.map((p) => p.v))
  let low = bars ? 0 : min, high = max
  if (high - low < 1e-6) { high += 1; if (!bars) low -= 1 }
  return { min, max, low, high }
}

/**
 * An icon for CWA's weather wording (晴時多雲, 多雲短暫陣雨…), read from its words rather than its code table, so a
 * description we have not seen yet still gets the right family. Clear nights get a moon.
 */
export function weatherIcon(text: string, start: string) {
  const hour = (new Date(start).getUTCHours() + 8) % 24, night = hour < 6 || hour >= 18 // Taipei, no DST
  if (text.includes('雪')) return '🌨️'
  if (text.includes('雷')) return '⛈️'
  if (text.includes('雨')) return text.startsWith('晴') && !night ? '🌦️' : '🌧️'
  if (text.includes('霧')) return '🌫️'
  if (text.startsWith('晴')) return night ? '🌙' : text.includes('雲') ? '🌤️' : '☀️'
  if (text.startsWith('多雲') && text.includes('晴')) return night ? '☁️' : '⛅'
  return '☁️' // 多雲, 陰
}

export type ForecastDay = { noon: number; day?: ForecastPeriod; night?: ForecastPeriod }
const HOUR = 3600e3, DAY = 24 * HOUR

/** A day's extremes out of its periods: the highest high and the lowest low, or null when neither half has a number. */
export function dayExtremes(periods: (ForecastPeriod | undefined)[]) {
  const max = periods.flatMap((p) => p?.max ?? []), min = periods.flatMap((p) => p?.min ?? [])
  return max.length && min.length ? { max: Math.max(...max), min: Math.min(...min) } : null
}

/**
 * The week ahead as the cards show it and the map colours it: periods already over are dropped (so today is what is
 * left of it) and so is the night still running before 06:00, which `forecastDays` files under yesterday; seven days
 * from today, matching the forecast layer's frames.
 */
export const upcomingWeek = (periods: ForecastPeriod[], now: number) =>
  forecastDays(periods.filter((p) => Date.parse(p.end) > now)).filter((d) => taiwanDay(d.noon) >= taiwanDay(now)).slice(0, 7)

/** Per Taiwan day (as `taiwanDay` counts them), the week's extremes: what the forecast layer colours, from the same week the card shows. */
export function weekExtremes(periods: ForecastPeriod[], now: number) {
  const out = new Map<number, { max: number; min: number }>()
  for (const d of upcomingWeek(periods, now)) { const x = dayExtremes([d.day, d.night]); if (x) out.set(taiwanDay(d.noon), x) }
  return out
}

/**
 * CWA's 12-hour periods as one column per Taiwan day: 06–18 is the day, 18–06 that day's night, and an overnight
 * 00–06 period (asked for after midnight) belongs to the evening before. `noon` names the day for formatting.
 */
export function forecastDays(periods: ForecastPeriod[]): ForecastDay[] {
  const days = new Map<number, ForecastDay>()
  for (const p of periods) {
    const shifted = Date.parse(p.start) + 8 * HOUR - 6 * HOUR // Taipei (UTC+8, no DST), with the day starting at 06:00
    const n = Math.floor(shifted / DAY)
    const d = days.get(n) ?? { noon: n * DAY + 4 * HOUR } // 12:00 Taipei is 04:00 UTC
    d[shifted - n * DAY < 12 * HOUR ? 'day' : 'night'] = p
    days.set(n, d)
  }
  return [...days.values()]
}
