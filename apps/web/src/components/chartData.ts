import type { Observation } from '../api'

export const stationSnapshot = (observations: Observation[], stationId: number) => observations.find((o) => o.stationId === stationId) ?? null

export function chartExtent(points: { v: number }[], bars = false) {
  const min = Math.min(...points.map((p) => p.v)), max = Math.max(...points.map((p) => p.v))
  let low = bars ? 0 : min, high = max
  if (high - low < 1e-6) { high += 1; if (!bars) low -= 1 }
  return { min, max, low, high }
}
