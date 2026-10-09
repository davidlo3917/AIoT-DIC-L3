import { and, eq, inArray, lt } from 'drizzle-orm'
import { fetchFileApi } from '../cwa/client.js'
import { db } from '../db/client.js'
import { weatherFrames } from '../db/schema.js'
import { gridToPng, parseGrid, type GridEncoding } from '../lib/grid.js'
import { remove, upload } from '../lib/storage.js'
import type { GridLayer } from '../routes/query.js'

// Both products are published on a TWD67 lat/lon grid. Across Taiwan, TWD67 → WGS84 is a near-constant shift
// (measured from CWA's own station records, which carry both): about −0.0018° lat, +0.0082° lon (~800 m).
// ponytail: constant shift, good to tens of metres; use a real datum transform if sub-cell accuracy ever matters.
const TWD67_TO_WGS84 = { lat: -0.0018, lon: 0.0082 }

type GridSpec = {
  layer: 'temperature-grid' | 'rain-grid'
  datasetId: string
  read: (dataset: any) => { content: string; time: string; west: number; south: number; res: number; width: number; height: number }
  isValid: (v: number) => boolean
  encoding: Pick<GridEncoding, 'offset' | 'scale'>
}

const GRIDS: GridSpec[] = [
  {
    layer: 'temperature-grid',
    datasetId: 'O-A0038-003', // hourly, 0.03°, land only (sea = -999)
    read: (d) => ({
      content: d.Resource.Content, time: d.DataTime.DateTime, res: 0.03, width: 67, height: 120,
      west: Number(d.GeoInfo.BottomLeftLongitude), south: Number(d.GeoInfo.BottomLeftLatitude),
    }),
    isValid: (v) => v > -90,
    encoding: { offset: 50, scale: 100 }, // −50…605 °C at 0.01° steps
  },
  {
    layer: 'rain-grid',
    datasetId: 'O-B0045-001', // every 10 min, 0.0125°, radar QPE for the past hour (outside coverage = -1)
    read: (d) => {
      const p = d.datasetInfo.parameterSet
      return {
        content: d.contents.content, time: p.DateTime, res: Number(p.GridResolution),
        width: Number(p.GridDimensionX), height: Number(p.GridDimensionY),
        west: Number(p.StartPointLongitude), south: Number(p.StartPointLatitude),
      }
    },
    isValid: (v) => v >= 0,
    encoding: { offset: 0, scale: 10 }, // 0…6553 mm at 0.1 mm steps
  },
]

export const pad = (n: number, width = 2) => String(n).padStart(width, '0')
/** `layer/YYYY/MM/DD/HHMMZ.ext`; `suffix` goes between the time and the extension (wind: `/006` for a lead time under its run). */
export const framePath = (layer: string, t: Date, ext = 'png', suffix = '') =>
  `${layer}/${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())}/${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}Z${suffix}.${ext}`

async function ingestGrid(spec: GridSpec) {
  const g = spec.read((await fetchFileApi(spec.datasetId)).cwaopendata.dataset)
  const validAt = new Date(g.time)
  if (Number.isNaN(validAt.getTime())) throw new Error(`${spec.datasetId}: unreadable time "${g.time}"`)

  const [existing] = await db.select({ id: weatherFrames.id }).from(weatherFrames)
    .where(and(eq(weatherFrames.layerType, spec.layer), eq(weatherFrames.validAt, validAt)))
  if (existing) return { layer: spec.layer, time: validAt.toISOString(), stored: false }

  const encoding: GridEncoding = { encoding: 'rg16', width: g.width, height: g.height, ...spec.encoding }
  const png = gridToPng(parseGrid(g.content, g.width, g.height), encoding, spec.isValid)
  const storagePath = framePath(spec.layer, validAt)
  await upload(storagePath, png) // upload first: a row must never point at a missing file

  // Values sit at cell centres, so the image covers half a cell beyond the first/last point on every side.
  const half = g.res / 2
  await db.insert(weatherFrames).values({
    layerType: spec.layer, validAt, storagePath, metadataJson: encoding,
    minLon: g.west - half + TWD67_TO_WGS84.lon, maxLon: g.west + (g.width - 1) * g.res + half + TWD67_TO_WGS84.lon,
    minLat: g.south - half + TWD67_TO_WGS84.lat, maxLat: g.south + (g.height - 1) * g.res + half + TWD67_TO_WGS84.lat,
  }).onConflictDoNothing({ target: weatherFrames.storagePath })
  return { layer: spec.layer, time: validAt.toISOString(), stored: true, bytes: png.length }
}

// Radar and satellite are ready-made pictures: CWA's JSON points at an image on its public S3, every 10 min. We keep
// a copy per timestamp, because CWA only ever serves the latest one and the timeline needs history.
type ImageSpec = {
  layer: 'radar' | 'satellite'
  datasetId: string
  format: keyof typeof FORMATS
  read: (dataset: any) => { time: unknown; url: unknown; lonRange: unknown; latRange: unknown }
}

const FORMATS = { png: { type: 'image/png', magic: '89504e47' }, jpg: { type: 'image/jpeg', magic: 'ffd8ff' } } as const

const IMAGES: ImageSpec[] = [
  {
    layer: 'radar', datasetId: 'O-A0058-005', format: 'png', // composite reflectivity, transparent background, 3600²
    read: (d) => ({ time: d.DateTime, url: d.resource?.ProductURL, lonRange: d.datasetInfo?.parameterSet?.LongitudeRange, latRange: d.datasetInfo?.parameterSet?.LatitudeRange }),
  },
  {
    layer: 'satellite', datasetId: 'O-C0042-002', format: 'jpg', // Himawari infrared colour composite, opaque, 800², coastlines drawn in
    read: (d) => ({ time: d.ObsTime?.Datetime, url: d.Resource?.ProductURL, lonRange: d.GeoInfo?.LongitudeRange, latRange: d.GeoInfo?.LatitudeRange }),
  },
]

const CWA_IMAGE_HOST = 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // same cap as the bucket

const range = (text: unknown) => {
  const m = /^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/.exec(String(text).trim()) // "115.00-126.50"
  if (!m) throw new Error(`unreadable range "${text}"`)
  return [Number(m[1]), Number(m[2])] as const
}

async function ingestImage(spec: ImageSpec) {
  const d = spec.read((await fetchFileApi(spec.datasetId)).cwaopendata.dataset)
  const validAt = new Date(String(d.time))
  if (Number.isNaN(validAt.getTime())) throw new Error(`${spec.datasetId}: unreadable time "${d.time}"`)

  const [existing] = await db.select({ id: weatherFrames.id }).from(weatherFrames)
    .where(and(eq(weatherFrames.layerType, spec.layer), eq(weatherFrames.validAt, validAt)))
  if (existing) return { layer: spec.layer, time: validAt.toISOString(), stored: false }

  // The URL comes out of a remote document, so it is untrusted input: only ever fetch from CWA's own bucket, and
  // only store bytes that are the picture format the bucket and the browser expect.
  const url = String(d.url)
  if (!url.startsWith(CWA_IMAGE_HOST)) throw new Error(`${spec.datasetId}: refusing to fetch image from unexpected host`)
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!res.ok) throw new Error(`${spec.datasetId}: image responded ${res.status}`)
  const image = Buffer.from(await res.arrayBuffer())
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) throw new Error(`${spec.datasetId}: image is ${image.length} bytes`)
  const { type, magic } = FORMATS[spec.format]
  if (!image.subarray(0, 4).toString('hex').startsWith(magic)) throw new Error(`${spec.datasetId}: image is not ${type}`)

  const [minLon, maxLon] = range(d.lonRange)
  const [minLat, maxLat] = range(d.latRange)
  const storagePath = framePath(spec.layer, validAt, spec.format)
  await upload(storagePath, image, type)
  await db.insert(weatherFrames).values({ layerType: spec.layer, validAt, storagePath, minLon, maxLon, minLat, maxLat })
    .onConflictDoNothing({ target: weatherFrames.storagePath })
  return { layer: spec.layer, time: validAt.toISOString(), stored: true, bytes: image.length }
}

/** Every product is independent: one failing (CWA hiccup) must not block the others. `only` limits the run to one product. */
export async function ingestGrids(only?: GridLayer) {
  const jobs = [...GRIDS.map((g) => ({ layer: g.layer, run: () => ingestGrid(g) })), ...IMAGES.map((i) => ({ layer: i.layer, run: () => ingestImage(i) }))]
    .filter((j) => !only || j.layer === only)
  const results = await Promise.allSettled(jobs.map((j) => j.run()))
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : (console.error(`ingest ${jobs[i].layer} failed:`, r.reason), { layer: jobs[i].layer, error: true }))
}

const FRAME_RETENTION_DAYS = 7 // what the timeline plays back; free-tier Storage is 1 GB

export async function pruneFrames() {
  const cutoff = new Date(Date.now() - FRAME_RETENTION_DAYS * 86400e3)
  const old = await db.select({ id: weatherFrames.id, path: weatherFrames.storagePath }).from(weatherFrames)
    .where(lt(weatherFrames.validAt, cutoff)).limit(1000) // ponytail: one batch per night is ~3 days of backlog; plenty
  await remove(old.map((f) => f.path)) // files first: an orphan row is visible and retried, an orphan file is invisible
  if (old.length) await db.delete(weatherFrames).where(inArray(weatherFrames.id, old.map((f) => f.id)))
  return { removed: old.length, cutoff: cutoff.toISOString() }
}
