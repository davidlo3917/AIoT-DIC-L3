import type { Frame } from '../../api'
import { colorOf, type Ramp } from '../../ramps'

/** A decoded field: row 0 = north. NaN = no data. `bounds` = [west, south, east, north] of the image edges. */
export type Field = { width: number; height: number; values: Float32Array; bounds: [number, number, number, number] }

const cache = new Map<string, Promise<Field>>() // frames are immutable per URL; keep the last few decoded
export function loadField(frame: Frame): Promise<Field> {
  const { url, meta, bounds } = frame
  if (!url || !meta || !bounds) return Promise.reject(new Error('frame has no image'))
  let hit = cache.get(url)
  if (!hit) {
    hit = decode(url, meta.width, meta.height, meta.offset, meta.scale, bounds)
    cache.set(url, hit)
    hit.catch(() => cache.delete(url))
    if (cache.size > 40) cache.delete(cache.keys().next().value!)
  }
  return hit
}

async function decode(url: string, width: number, height: number, offset: number, scale: number, bounds: Field['bounds']): Promise<Field> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  // premultiplyAlpha 'none' + no colour conversion: the bytes ARE the data, any "helpful" adjustment corrupts it.
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  const px = ctx.getImageData(0, 0, width, height).data
  const values = new Float32Array(width * height)
  for (let i = 0; i < values.length; i++) values[i] = px[i * 4 + 3] ? ((px[i * 4] << 8) | px[i * 4 + 1]) / scale - offset : NaN
  return { width, height, values, bounds }
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const latOfMercY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90

/**
 * Colour a field onto a canvas whose rows are evenly spaced in Web-Mercator Y. The source rows are evenly spaced in
 * latitude; MapLibre stretches an image linearly in Mercator, so without this the middle of a 7°-tall rain field
 * sits ~7 km off the coastline.
 */
export function paint(field: Field, ramp: Ramp, canvas: HTMLCanvasElement, bleed = false) {
  const { width, height, values, bounds: [, south, , north] } = field
  // Coarse grids (temperature is 3 km cells) are upsampled with bilinear interpolation so the surface reads as a
  // field, not as tiles. Stepped ramps (rain) stay nearest-neighbour: blending across a threshold invents values.
  const k = height < 300 ? 6 : 1, smooth = k > 1 && !ramp.stepped
  const W = width * k, H = height * k
  canvas.width = W
  canvas.height = H
  const img = new ImageData(W, H)
  const yTop = mercY(north), yBottom = mercY(south)
  const lut = new Map<number, [number, number, number, number]>()
  const at = (col: number, row: number) => values[Math.min(height - 1, Math.max(0, row)) * width + Math.min(width - 1, Math.max(0, col))]
  for (let y = 0; y < H; y++) {
    const lat = latOfMercY(yTop + ((y + 0.5) / H) * (yBottom - yTop))
    const fy = ((north - lat) / (north - south)) * height - 0.5 // source row, fractional, measured at cell centres
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / k - 0.5
      let v = at(Math.round(fx), Math.round(fy))
      if (Number.isNaN(v)) {
        // `bleed`: CWA's land mask is a 3 km staircase. Extend the field ~2 cells past it and let the basemap's own
        // water polygons (drawn on top, see useWeather) cut the true coastline instead.
        if (!bleed) continue
        const cc = Math.round(fx), rc = Math.round(fy)
        let num = 0, den = 0
        for (let r = rc - 2; r <= rc + 2; r++) for (let c = cc - 2; c <= cc + 2; c++) {
          if (c < 0 || r < 0 || c >= width || r >= height) continue
          const n = values[r * width + c]
          if (Number.isNaN(n)) continue
          const w = 1 / ((c - fx) ** 2 + (r - fy) ** 2)
          num += n * w; den += w
        }
        if (!den) continue
        v = num / den
      } else
      if (smooth) { // (the `else` above: only cells that are valid themselves are blended with neighbours)
        const c0 = Math.floor(fx), r0 = Math.floor(fy), tx = fx - c0, ty = fy - r0
        let num = 0, den = 0
        for (const [c, r, w] of [[c0, r0, (1 - tx) * (1 - ty)], [c0 + 1, r0, tx * (1 - ty)], [c0, r0 + 1, (1 - tx) * ty], [c0 + 1, r0 + 1, tx * ty]]) {
          const n = at(c, r)
          if (!Number.isNaN(n)) { num += n * w; den += w } // sea neighbours drop out; weights renormalise
        }
        if (den > 0) v = num / den
      }
      const key = Math.round(v * 10)
      let c = lut.get(key)
      if (!c) lut.set(key, (c = colorOf(ramp, key / 10)))
      img.data.set(c, (y * W + x) * 4)
    }
  }
  canvas.getContext('2d')!.putImageData(img, 0, 0)
}
