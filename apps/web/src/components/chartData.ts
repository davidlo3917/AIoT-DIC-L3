import type { Observation } from '../api'

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
