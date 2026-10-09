import type { Frame } from '../../api'
import { colorOf, type Ramp } from '../../ramps'

/** A decoded field: row 0 = north. NaN = no data. `bounds` = [west, south, east, north] of the image edges. */
export type Field = { width: number; height: number; values: Float32Array; bounds: [number, number, number, number] }

/** A wind field: `values` is the speed (what the surface colours), u and v drive the particles. */
export type WindField = Field & { u: Float32Array; v: Float32Array }

const cache = new Map<string, Promise<Field>>() // frames are immutable per URL; keep the last few decoded
export function loadField(frame: Frame): Promise<Field> {
  const { url, meta, bounds } = frame
  if (!url || !bounds || meta?.encoding !== 'rg16') return Promise.reject(new Error('frame is not an encoded grid'))
  return remember(cache, url, 40, async () => {
    const { width, height, offset, scale } = meta, px = await pixels(url, width, height)
    const values = new Float32Array(width * height)
    for (let i = 0; i < values.length; i++) values[i] = px[i * 4 + 3] ? ((px[i * 4] << 8) | px[i * 4 + 1]) / scale - offset : NaN
    return { width, height, values, bounds }
  })
}

const winds = new Map<string, Promise<WindField>>()
export function loadWind(frame: Frame): Promise<WindField> {
  const { url, meta, bounds } = frame
  if (!url || !bounds || meta?.encoding !== 'uv8') return Promise.reject(new Error('frame is not a wind field'))
  return remember(winds, url, 12, async () => {
    const { width, height } = meta, px = await pixels(url, width, height), n = width * height
    const u = new Float32Array(n), v = new Float32Array(n), values = new Float32Array(n)
    for (let i = 0; i < n; i++) { // uv8 (ingestion/wind.ts): R = (u + 64) × 2, G = (v + 64) × 2, B = speed × 4, A = 255 where known
      const a = px[i * 4 + 3]
      u[i] = a ? px[i * 4] / 2 - 64 : NaN
      v[i] = a ? px[i * 4 + 1] / 2 - 64 : NaN
      values[i] = a ? px[i * 4 + 2] / 4 : NaN
    }
    return { width, height, values, u, v, bounds }
  })
}

function remember<T>(store: Map<string, Promise<T>>, url: string, keep: number, load: () => Promise<T>) {
  let hit = store.get(url)
  if (!hit) {
    hit = load()
    store.set(url, hit)
    hit.catch(() => store.delete(url))
    if (store.size > keep) store.delete(store.keys().next().value!)
  }
  return hit
}

async function pixels(url: string, width: number, height: number) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  // premultiplyAlpha 'none' + no colour conversion: the bytes ARE the data, any "helpful" adjustment corrupts it.
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!
  try { ctx.drawImage(bitmap, 0, 0) } finally { bitmap.close() }
  return ctx.getImageData(0, 0, width, height).data
}

// ---- ready-made images (radar, satellite) ----------------------------------------------------------------------

// CWA's radar PNG is 3600² (52 MB decoded). Decode it at a size the screen can actually show; on a phone that is
// the difference between smooth playback and the tab being killed for memory.
const IMAGE_SIZE = Math.max(window.innerWidth, window.innerHeight) * window.devicePixelRatio > 2000 ? 1800 : 1200

// Cached ready to show (decoded, resized AND redrawn for Mercator), so presenting a frame during playback is one blit.
const images = new Map<string, Promise<OffscreenCanvas>>()
export function loadImage(url: string, bounds: Field['bounds']): Promise<OffscreenCanvas> {
  return remember(images, url, 8, async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    const blob = await res.blob()
    // Older Safari rejects the resize options; fall back to a full-size decode rather than to no radar.
    const bitmap = await createImageBitmap(blob, { resizeWidth: IMAGE_SIZE, resizeHeight: IMAGE_SIZE, resizeQuality: 'medium' }).catch(() => createImageBitmap(blob))
    try { return resample(bitmap, bounds) } finally { bitmap.close() }
  })
}

/** Same Mercator correction as `paint`, for an equirectangular picture: redraw it one row at a time. */
function resample(bitmap: ImageBitmap, [, south, , north]: Field['bounds']) {
  const W = Math.min(bitmap.width, IMAGE_SIZE), H = Math.min(bitmap.height, IMAGE_SIZE)
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d')!
  const yTop = mercY(north), yBottom = mercY(south)
  const srcRow = (y: number) => ((north - latOfMercY(yTop + (y / H) * (yBottom - yTop))) / (north - south)) * bitmap.height
  for (let y = 0; y < H; y++) {
    const from = srcRow(y)
    ctx.drawImage(bitmap, 0, from, bitmap.width, Math.max(1, srcRow(y + 1) - from), 0, y, W, 1)
  }
  return canvas
}

export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
export const latOfMercY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90

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
