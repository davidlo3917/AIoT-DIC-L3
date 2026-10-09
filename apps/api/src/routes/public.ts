import { and, asc, between, eq, getTableColumns, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'
import { fetchDatastore } from '../cwa/client.js'
import { COUNTY_FORECASTS, ELEMENTS, normalizeForecast } from '../cwa/forecast.js'
import { normalizeTyphoons, TYPHOON_DATASET } from '../cwa/typhoon.js'
import { normalizeWarnings, WARNING_DATASETS } from '../cwa/warnings.js'
import { db } from '../db/client.js'
import { publicUrl } from '../lib/storage.js'
import { stationObservations as obs, stations, weatherFrames } from '../db/schema.js'
import { atQuery, forecastQuery, layerQuery, rangeQuery, stationIdParam } from './query.js'

// Stations report at different cadences (10 min / hourly) and CWA publishes ~15 min late, so "the reading at T"
// means the newest non-null value per field inside this window before T.
const LOOKBACK_MINUTES = 100

const READINGS = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'gust_speed', 'rain_1h', 'rain_24h'] as const
const camel = (s: string) => s.replace(/_(\w)/g, (_, c) => c.toUpperCase())
const newestNonNull = sql.join(READINGS.map((col) =>
  sql.raw(`(array_agg(${col} order by observed_at desc) filter (where ${col} is not null))[1] as "${camel(col)}"`)), sql`, `)

function readingsAt(at: Date) {
  return db.execute(sql`
    select station_id as "stationId", ${newestNonNull}
    from station_observations
    where observed_at <= ${at.toISOString()}::timestamptz
      and observed_at > ${at.toISOString()}::timestamptz - make_interval(mins => ${LOOKBACK_MINUTES})
    group by station_id`)
}

export const parse = <S extends z.ZodType>(schema: S, input: unknown, what = 'query'): z.output<S> => {
  const r = schema.safeParse(input)
  if (r.success) return r.data
  const error = r.error.issues.map((i) => `${i.path.join('.') || what}: ${i.message}`).join('; ')
  throw new HTTPException(400, { res: Response.json({ error }, { status: 400 }) }) // app.onError passes these through
}

// Public data, identical for every visitor: let Vercel's CDN absorb the traffic instead of the free-tier database.
const cache = (seconds: number) => `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`

const { createdAt, updatedAt, ...stationColumns } = getTableColumns(stations)

const findStation = async (raw: string) => {
  const cwaId = parse(stationIdParam, raw, 'station id')
  const [station] = await db.select(stationColumns).from(stations).where(eq(stations.cwaStationId, cwaId))
  return station
}

export const publicRoutes = new Hono()
  .get('/stations', async (c) => {
    c.header('Cache-Control', cache(3600))
    return c.json(await db.select(stationColumns).from(stations).orderBy(asc(stations.id)))
  })

  .get('/stations/:id/history', async (c) => {
    const { from, to } = parse(rangeQuery, c.req.query())
    const station = await findStation(c.req.param('id'))
    if (!station) return c.json({ error: 'station not found' }, 404)
    const { stationId: _, ...readings } = getTableColumns(obs)
    const rows = await db.select(readings).from(obs)
      .where(and(eq(obs.stationId, station.id), between(obs.observedAt, from, to))).orderBy(asc(obs.observedAt))
    c.header('Cache-Control', cache(60))
    return c.json({ station, from, to, observations: rows })
  })

  // Every station's reading at one instant — what a map layer draws for one timeline position.
  .get('/observations', async (c) => {
    const { at } = parse(atQuery, c.req.query())
    c.header('Cache-Control', cache(60))
    return c.json({ at, observations: await readingsAt(at) })
  })

  // One township's coming week, straight from CWA: nothing is stored, and the CDN answers repeat visitors (CWA
  // reissues these every 6 h). Keyed by township, not station, so the 1,367 stations share 368 cache entries.
  .get('/forecast', async (c) => {
    const { county, town } = parse(forecastQuery, c.req.query())
    // Only townships a station names reach CWA: a made-up name must not spend a call on our key, and the CDN keeps
    // no 404s. Every station's township is in CWA's list (checked 2026-10-09).
    const [known] = await db.select({ id: stations.id }).from(stations).where(and(eq(stations.county, county), eq(stations.town, town))).limit(1)
    if (!known) return c.json({ error: 'township not found' }, 404)
    const periods = normalizeForecast(await fetchDatastore(COUNTY_FORECASTS[county], { LocationName: town, ElementName: ELEMENTS.join(',') }, 10_000))
    if (!periods) return c.json({ error: 'township not found' }, 404)
    c.header('Cache-Control', cache(1800))
    return c.json({ county, town, periods })
  })

  // Every active tropical cyclone with its track and forecast, straight from CWA (reissued every 3–6 h); nothing stored.
  .get('/typhoons', async (c) => {
    c.header('Cache-Control', cache(600))
    return c.json({ cyclones: normalizeTyphoons(await fetchDatastore(TYPHOON_DATASET, {}, 10_000)) })
  })

  // The county advisories in force (大雨, 豪雨, 陸上強風, 低溫…) with CWA's own text, live; nothing stored.
  .get('/warnings', async (c) => {
    const [counties, texts] = await Promise.all([fetchDatastore(WARNING_DATASETS.counties, {}, 10_000), fetchDatastore(WARNING_DATASETS.texts, {}, 10_000)])
    c.header('Cache-Control', cache(300))
    return c.json({ warnings: normalizeWarnings(counties, texts) })
  })

  // The timeline's one contract: every layer answers "which instants do you have?" in the same shape.
  .get('/frames', async (c) => {
    const { layer } = parse(layerQuery, c.req.query())
    const { from, to } = parse(rangeQuery, c.req.query())
    c.header('Cache-Control', cache(60))

    if (layer === 'stations') {
      // Observations sit on a regular 10-minute grid, so the frames are that grid clipped to what is stored.
      const [b] = await db.select({ min: sql<Date | null>`min(${obs.observedAt})`, max: sql<Date | null>`max(${obs.observedAt})` }).from(obs)
      if (!b?.min || !b.max) return c.json({ layer, frames: [] })
      const step = 600e3
      const start = Math.ceil(Math.max(from.getTime(), new Date(b.min).getTime()) / step) * step
      const end = Math.min(to.getTime(), new Date(b.max).getTime())
      const frames = []
      for (let t = start; t <= end; t += step) frames.push({ time: new Date(t).toISOString() })
      return c.json({ layer, frames })
    }

    const rows = await db.select().from(weatherFrames)
      .where(and(eq(weatherFrames.layerType, layer), between(weatherFrames.validAt, from, to))).orderBy(asc(weatherFrames.validAt))
    return c.json({
      layer,
      frames: rows.map((f) => ({
        time: f.validAt.toISOString(), url: publicUrl(f.storagePath), bounds: [f.minLon, f.minLat, f.maxLon, f.maxLat], meta: f.metadataJson,
      })),
    })
  })
