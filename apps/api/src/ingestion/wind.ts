import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { weatherFrames } from '../db/schema.js'
import { lccProjector, parseHeader, unpackSimple, type GribHeader, type LccGrid } from '../lib/grib.js'
import { encodePng } from '../lib/png.js'
import { remove, upload } from '../lib/storage.js'
import { framePath, pad } from './grids.js'

// CWA's WRF 3 km forecast (M-A0064): one ~180 MB GRIB2 file per lead time, 6-hourly to +84 h, 78 fields each, of
// which two are the 10 m wind. The files sit on CWA's public S3, which honours Range requests, so an hour costs a walk
// over the message headers (~67 reads of 256 bytes, usually replaced by two reads at the previous file's offsets) and
// the two 2.3 MB data sections; nothing else is downloaded.
const HOST = 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Model/'
const HOURS = Array.from({ length: 15 }, (_, i) => i * 6)
const LAYER = 'wind'
const HEAD = 256 // sections 0–6 of every message in these files fit (179 or 203 bytes)
const MAX_DATA = 4 * 1024 * 1024 // a 24-bit field of 779,334 points is 2.3 MB
// No new hour starts after this; the 20 s left before the function's 60 s limit is far more than one hour needs (~1–2 s
// in Tokyo, 8 s measured from Taiwan). A call that runs out leaves the remaining hours to the next one.
const BUDGET_MS = 40_000

/** The frame: a lat/lon crop around Taiwan at ~0.03° (the WRF spacing), north-up, values at cell centres. */
export const CROP = { west: 115, east: 127, south: 19, north: 29, width: 400, height: 334 }
export type WindEncoding = { encoding: 'uv8'; width: number; height: number; unit: 'm/s'; run: string; hour: number }

/** One range of the file. `etag` (from the first read) makes S3 answer 412 instead of bytes from a file CWA has since replaced. */
async function fetchRange(url: string, from: number, length: number, etag?: string) {
  const headers: Record<string, string> = { Range: `bytes=${from}-${from + length - 1}` }
  if (etag) headers['If-Match'] = etag
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (res.status !== 206) throw new Error(`${url.slice(HOST.length)}: range request responded ${res.status}`)
  const total = Number(/\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1])
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > length || !total) throw new Error(`${url.slice(HOST.length)}: got ${bytes.length} bytes for a ${length}-byte range`)
  return { bytes, total, etag: res.headers.get('etag') ?? undefined }
}

const isWind = (h: GribHeader, parameter: number) => h.discipline === 0 && h.category === 2 && h.parameter === parameter && h.levelType === 103 && h.level === 10

type Found = { at: number; header: GribHeader }
// Where the last file kept its wind. The files of one run share a layout (the 67th and 68th messages, offsets shifted
// by one longer and a few shorter messages before them), so two reads usually replace the walk; a miss just walks.
let hint: { u: number; v: number } | null = null

/** The 10 m U and V messages of one file: tried at the previous file's offsets, else found by walking the headers. */
async function findWind(url: string, first: GribHeader, total: number, etag?: string) {
  const read = async (at: number): Promise<Found> => ({ at, header: parseHeader((await fetchRange(url, at, HEAD, etag)).bytes) })
  if (hint && hint.v + HEAD <= total) {
    const [u, v] = await Promise.all([read(hint.u), read(hint.v)]).catch(() => [undefined, undefined])
    if (u && v && isWind(u.header, 2) && isWind(v.header, 3)) return { u, v }
  }
  const found: { u?: Found; v?: Found } = {}
  let at = 0, header = first
  for (let n = 0; n < 200; n++) {
    if (isWind(header, 2)) found.u = { at, header }
    else if (isWind(header, 3)) found.v = { at, header }
    if (found.u && found.v) {
      hint = { u: found.u.at, v: found.v.at }
      return found as Required<typeof found>
    }
    at += header.length
    if (at + HEAD > total) break
    header = (await read(at)).header
  }
  throw new Error(`${url.slice(HOST.length)}: no 10 m wind among the messages`)
}

// Where each output cell centre falls on the Lambert grid, computed once: the grid is the same in every file.
let positions: { key: string; i: Float32Array; j: Float32Array } | null = null
function gridPositions(grid: LccGrid) {
  const key = JSON.stringify(grid)
  if (positions?.key === key) return positions
  const project = lccProjector(grid), { width, height, west, east, south, north } = CROP
  const i = new Float32Array(width * height), j = new Float32Array(width * height)
  for (let row = 0; row < height; row++) {
    const lat = north - ((row + 0.5) / height) * (north - south)
    for (let col = 0; col < width; col++) {
      const [gi, gj] = project(lat, west + ((col + 0.5) / width) * (east - west))
      i[row * width + col] = gi
      j[row * width + col] = gj
    }
  }
  return (positions = { key, i, j })
}

/** Bilinear sample of a Lambert-grid field (row 0 = south) onto the crop (row 0 = north); NaN outside the grid. */
export function resample(field: Float32Array, grid: LccGrid): Float32Array {
  const { i: is, j: js } = gridPositions(grid), { nx, ny } = grid
  const out = new Float32Array(is.length).fill(NaN)
  for (let k = 0; k < out.length; k++) {
    const i = is[k], j = js[k], i0 = Math.floor(i), j0 = Math.floor(j)
    if (i0 < 0 || j0 < 0 || i0 + 1 >= nx || j0 + 1 >= ny) continue
    const ti = i - i0, tj = j - j0, a = j0 * nx + i0
    out[k] = (field[a] * (1 - ti) + field[a + 1] * ti) * (1 - tj) + (field[a + nx] * (1 - ti) + field[a + nx + 1] * ti) * tj
  }
  return out
}

/** uv8: R = (u + 64) × 2 and G = (v + 64) × 2 (0.5 m/s steps, ±64 m/s), B = speed × 4 (0.25 m/s steps to 63.75), A = 255; outside the grid A = 0. */
export function encodeUv8(u: Float32Array, v: Float32Array, width: number, height: number): Buffer {
  const rgba = new Uint8Array(width * height * 4)
  const q = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  for (let i = 0; i < u.length; i++) {
    if (Number.isNaN(u[i]) || Number.isNaN(v[i])) continue
    rgba[i * 4] = q((u[i] + 64) * 2)
    rgba[i * 4 + 1] = q((v[i] + 64) * 2)
    rgba[i * 4 + 2] = q(Math.hypot(u[i], v[i]) * 4)
    rgba[i * 4 + 3] = 255
  }
  return encodePng(width, height, rgba)
}

/** One lead time: read the file's run, and if it is newer than the frame stored for that valid time, decode and store it. */
export async function ingestHour(hour: number) {
  const url = `${HOST}M-A0064-${pad(hour, 3)}.grb2` // a fixed host and a number: nothing in the URL comes from outside
  const { bytes, total, etag } = await fetchRange(url, 0, HEAD)
  const first = parseHeader(bytes)
  if (first.forecastHours !== hour) throw new Error(`M-A0064-${pad(hour, 3)}: file holds lead time +${first.forecastHours} h`)
  const run = first.refTime, validAt = new Date(run.getTime() + hour * 3600e3)

  const [existing] = await db.select({ id: weatherFrames.id, path: weatherFrames.storagePath, meta: weatherFrames.metadataJson }).from(weatherFrames)
    .where(and(eq(weatherFrames.layerType, LAYER), eq(weatherFrames.validAt, validAt)))
  const storedRun = (existing?.meta as WindEncoding | null)?.run
  if (storedRun && storedRun >= run.toISOString()) return { hour, time: validAt.toISOString(), stored: false }

  const { u, v } = await findWind(url, first, total, etag)
  for (const m of [u, v]) if (m.header.data.length > MAX_DATA) throw new Error(`M-A0064-${pad(hour, 3)}: data section is ${m.header.data.length} bytes`)
  const [ub, vb] = await Promise.all([u, v].map((m) => fetchRange(url, m.at + m.header.data.offset, m.header.data.length, etag).then((r) => r.bytes)))
  const png = encodeUv8(resample(unpackSimple(ub, u.header.packing), u.header.grid), resample(unpackSimple(vb, v.header.packing), v.header.grid), CROP.width, CROP.height)
  const meta: WindEncoding = { encoding: 'uv8', width: CROP.width, height: CROP.height, unit: 'm/s', run: run.toISOString(), hour }
  const storagePath = framePath(LAYER, run, 'png', `/${pad(hour, 3)}`) // the run is in the path: files are cached immutable, so a newer run is a new file
  await upload(storagePath, png) // upload first: a row must never point at a missing file
  // One row per valid time, so /frames needs no notion of runs: a newer run takes the row over and the older file goes.
  if (existing) {
    await db.update(weatherFrames).set({ storagePath, metadataJson: meta }).where(eq(weatherFrames.id, existing.id))
    if (existing.path !== storagePath) await remove([existing.path]).catch((e) => console.error(`wind: could not remove ${existing.path}:`, e)) // an orphan file is invisible, and costs ~130 KB
  } else {
    await db.insert(weatherFrames).values({ layerType: LAYER, validAt, storagePath, metadataJson: meta, minLon: CROP.west, maxLon: CROP.east, minLat: CROP.south, maxLat: CROP.north })
      .onConflictDoNothing({ target: weatherFrames.storagePath })
  }
  return { hour, time: validAt.toISOString(), run: meta.run, stored: true, bytes: png.length }
}

/** Every lead time in turn, newest run wins, within a time budget; `done: false` means the next call has work left. */
export async function ingestWind() {
  const start = Date.now(), results = []
  for (const hour of HOURS) {
    if (Date.now() - start > BUDGET_MS) return { done: false, results }
    results.push(await ingestHour(hour).catch((e) => (console.error(`ingest wind +${hour} failed:`, e), { hour, error: true })))
  }
  return { done: true, results }
}
