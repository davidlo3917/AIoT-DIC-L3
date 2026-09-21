import { inArray, sql } from 'drizzle-orm'
import { fetchDatastore, fetchHistoryFile, fetchHistoryTimes, xmlToObject } from '../cwa/client.js'
import { datastoreResponse, normalizeStation, type NormalizedStation } from '../cwa/stations.js'
import { db } from '../db/client.js'
import { stationObservations, stations } from '../db/schema.js'

// Order matters for station metadata: the three datasets share station ids (1,365 unique across 2,581 records)
// and disagree on a few names. Later datasets win, so the weather datasets override the rain-gauge one.
const DATASETS = ['O-A0002-001', 'O-A0001-001', 'O-A0003-001'] as const

// Postgres allows 65,535 bind parameters per statement; observations have 10 columns.
const CHUNK = 2000

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n))

export async function ingestStations() {
  const fetched = await Promise.all(DATASETS.map(async (id) => {
    const records = datastoreResponse.parse(await fetchDatastore(id)).records.Station
    const ok = records.map(normalizeStation).filter((r): r is NormalizedStation => r !== null)
    return { id, received: records.length, skipped: records.length - ok.length, ok }
  }))
  const all = fetched.flatMap((f) => f.ok)
  const meta = await upsertStations(all)
  const { observations, newObservations } = await storeObservations(all)
  return {
    datasets: fetched.map(({ id, received, skipped }) => ({ id, received, skipped })),
    stations: meta,
    observations,
    newObservations,
  }
}

async function upsertStations(all: NormalizedStation[]) {
  const meta = new Map(all.map((r) => [r.station.cwaStationId, r.station])) // last dataset wins
  for (const part of chunks([...meta.values()], CHUNK)) {
    await db.insert(stations).values(part).onConflictDoUpdate({
      target: stations.cwaStationId,
      set: {
        name: sql`excluded.name`, county: sql`excluded.county`, town: sql`excluded.town`,
        latitude: sql`excluded.latitude`, longitude: sql`excluded.longitude`, elevation: sql`excluded.elevation`,
        updatedAt: sql`now()`,
      },
    })
  }
  return meta.size
}

/** Observations of stations we don't know are dropped (a backfill reads one dataset, so it never writes station metadata). */
async function storeObservations(all: NormalizedStation[]) {
  if (!all.length) return { observations: 0, newObservations: 0 }
  const wanted = [...new Set(all.map((r) => r.station.cwaStationId))]
  const ids = new Map((await db.select({ id: stations.id, cwa: stations.cwaStationId }).from(stations)
    .where(inArray(stations.cwaStationId, wanted))).map((r) => [r.cwa, r.id]))

  // A station can appear in several datasets with the same timestamp (weather + rain). Postgres rejects two
  // rows hitting the same conflict target in one statement, so merge them here first — non-null wins.
  type Row = typeof stationObservations.$inferInsert
  const merged = new Map<string, Row>()
  for (const { station, observation } of all) {
    const stationId = ids.get(station.cwaStationId)
    if (stationId === undefined) continue
    const k = `${stationId}|${observation.observedAt.getTime()}`
    const prev = merged.get(k)
    if (!prev) merged.set(k, { stationId, ...observation })
    else for (const [col, v] of Object.entries(observation)) if (v !== null) (prev as Record<string, unknown>)[col] = v
  }

  // Same idea across runs: a later run must never blank out a reading an earlier one stored.
  const keep = (col: string) => sql.raw(`coalesce(excluded.${col}, station_observations.${col})`)
  let written = 0
  for (const part of chunks([...merged.values()], CHUNK)) {
    const res = await db.insert(stationObservations).values(part).onConflictDoUpdate({
      target: [stationObservations.stationId, stationObservations.observedAt],
      set: {
        temperature: keep('temperature'), humidity: keep('humidity'), pressure: keep('pressure'),
        windSpeed: keep('wind_speed'), windDirection: keep('wind_direction'), gustSpeed: keep('gust_speed'),
        rain1h: keep('rain_1h'), rain24h: keep('rain_24h'),
      },
      // xmax = 0 only for freshly inserted rows, so this counts new observations rather than re-touched ones.
    }).returning({ inserted: sql<boolean>`(xmax = 0)` })
    written += res.filter((r) => r.inserted).length
  }
  return { observations: merged.size, newObservations: written }
}

// CWA keeps 24 hourly snapshots of the automatic stations (the only station dataset with a usable history).
const HISTORY_DATASET = 'O-A0001-001'

/**
 * Fills the hours before our own ingestion started (or a gap it left). Newest first, `limit` files per call so one
 * call fits a serverless invocation; pass the returned `next` back as `before` until it is null.
 */
export async function backfillStations({ before, limit }: { before?: Date; limit: number }) {
  const times = (await fetchHistoryTimes(HISTORY_DATASET)).filter((t) => !before || new Date(t) < before)
  const files = []
  for (const time of times.slice(0, limit)) {
    // The root <cwaopendata xmlns=…> carries an attribute, so the reader starts one level in, at <dataset>.
    const records = [xmlToObject(await fetchHistoryFile(HISTORY_DATASET, time)).dataset?.Station ?? []].flat()
    const ok = records.map(normalizeStation).filter((r): r is NormalizedStation => r !== null)
    files.push({ time: new Date(time).toISOString(), received: records.length, skipped: records.length - ok.length, ...(await storeObservations(ok)) })
  }
  return { files, next: times.length > limit ? files.at(-1)!.time : null }
}
