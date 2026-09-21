import type { Field } from './grid'

/**
 * Inverse-distance-weighted surface from point readings, on the geometry of `mask` (only cells that are valid there,
 * i.e. land — CWA's temperature grid gives us Taiwan's outline for free).
 * ponytail: every cell looks at every station (≈3.5k land cells × ≈1.2k stations ≈ 4M distances, ~20 ms).
 * Switch to k-nearest via a grid index if the station count or grid size grows 10×.
 */
export function idw(points: { lon: number; lat: number; value: number }[], mask: Field, power = 2): Field {
  const { width, height, bounds: [west, south, east, north] } = mask
  const values = new Float32Array(width * height).fill(NaN)
  if (points.length < 3) return { ...mask, values }
  const cosLat = Math.cos((((south + north) / 2) * Math.PI) / 180) // a degree of longitude is shorter than one of latitude
  for (let row = 0; row < height; row++) {
    const lat = north - ((row + 0.5) / height) * (north - south)
    for (let col = 0; col < width; col++) {
      const i = row * width + col
      if (Number.isNaN(mask.values[i])) continue
      const lon = west + ((col + 0.5) / width) * (east - west)
      let num = 0, den = 0
      for (const p of points) {
        const dx = (p.lon - lon) * cosLat, dy = p.lat - lat, d2 = dx * dx + dy * dy
        if (d2 < 1e-8) { num = p.value; den = 1; break } // on top of a station: use its reading
        const w = 1 / d2 ** (power / 2)
        num += w * p.value
        den += w
      }
      values[i] = num / den
    }
  }
  return { ...mask, values }
}
