import type { Frame } from '../../api'
import type { WindField } from './grid'

const HOUR = 3600e3

/**
 * CWA's wind frames are 6 h apart; the timeline steps hourly. Each frame in between names the two real frames around
 * it and how far it sits from the first, and is blended from both when shown (DESIGN §13).
 */
export function hourly(frames: Frame[]): Frame[] {
  const out: Frame[] = []
  frames.forEach((a, i) => {
    out.push(a)
    const b = frames[i + 1]
    if (!b) return
    const t0 = Date.parse(a.time), gap = Date.parse(b.time) - t0 // ponytail: any gap is filled, so a missing lead time becomes a 12 h blend rather than a jump
    for (let ms = HOUR; ms < gap; ms += HOUR) out.push({ time: new Date(t0 + ms).toISOString(), bounds: a.bounds, meta: a.meta, between: [a, b, ms / gap] })
  })
  return out
}

/** The field `t` of the way from `a` to `b`: u and v blended, the speed that of the blended vector; a cell missing in either is missing. */
export function blend(a: WindField, b: WindField, t: number): WindField {
  if (a.width !== b.width || a.height !== b.height) return t < 0.5 ? a : b // never happens (one grid); nearest rather than garbage if it did
  const n = a.u.length, u = new Float32Array(n), v = new Float32Array(n), values = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    u[i] = a.u[i] + (b.u[i] - a.u[i]) * t
    v[i] = a.v[i] + (b.v[i] - a.v[i]) * t
    values[i] = Math.hypot(u[i], v[i])
  }
  return { ...a, u, v, values }
}
