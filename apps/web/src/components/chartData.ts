import type { ForecastPeriod, Observation } from '../api'

export const stationSnapshot = (observations: Observation[], stationId: number) => observations.find((o) => o.stationId === stationId) ?? null

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
