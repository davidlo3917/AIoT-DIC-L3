import { z } from 'zod'

const BASE = 'https://opendata.cwa.gov.tw'

/** REST "datastore" datasets (stations, forecasts, warnings, typhoons). Grids/imagery use the file API instead. */
export async function fetchDatastore(datasetId: string): Promise<unknown> {
  const key = process.env.CWA_API_KEY
  if (!key) throw new Error('CWA_API_KEY is not set')
  const res = await fetch(`${BASE}/api/v1/rest/datastore/${datasetId}?Authorization=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(30_000),
  })
  // Never include the URL in errors: it carries the API key.
  if (!res.ok) throw new Error(`CWA ${datasetId} responded ${res.status}`)
  return res.json()
}

/** File-API datasets (grids, radar, satellite): the endpoint 302s to a JSON document on CWA's public S3. */
export async function fetchFileApi(datasetId: string): Promise<any> {
  const key = process.env.CWA_API_KEY
  if (!key) throw new Error('CWA_API_KEY is not set')
  const res = await fetch(`${BASE}/fileapi/v1/opendataapi/${datasetId}?Authorization=${encodeURIComponent(key)}&downloadType=WEB&format=JSON`, {
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`CWA file ${datasetId} responded ${res.status}`) // no URL: it carries the key
  return res.json()
}

// ---- history API: past files, for backfilling. Only three datasets have one (`/historyapi/v1/getDataId`):
// O-A0001-001 (hourly snapshots, 24 h), O-A0002-001 (~1 h) and O-A0059-001 (radar grid, 10 days). Files are XML only.

const historyList = z.object({ dataset: z.object({ resources: z.object({ resource: z.object({ data: z.object({
  time: z.array(z.object({ DateTime: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+08:00$/) })),
}) }) }) }) })

/** Instants CWA still holds for a dataset, newest first. */
export async function fetchHistoryTimes(datasetId: string): Promise<string[]> {
  const key = process.env.CWA_API_KEY
  if (!key) throw new Error('CWA_API_KEY is not set')
  const res = await fetch(`${BASE}/historyapi/v1/getMetadata/${datasetId}?Authorization=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`CWA history list ${datasetId} responded ${res.status}`) // no URL: it carries the key
  return historyList.parse(await res.json()).dataset.resources.resource.data.time.map((t) => t.DateTime).sort().reverse()
}

/** One past file, as XML text. The URL is built from the (validated) timestamp rather than taken from CWA's listing. */
export async function fetchHistoryFile(datasetId: string, dateTime: string): Promise<string> {
  const key = process.env.CWA_API_KEY
  if (!key) throw new Error('CWA_API_KEY is not set')
  const path = dateTime.slice(0, 19).replace(/[-T:]/g, '/') // 2026-09-21T02:00:00+08:00 → 2026/09/21/02/00/00
  const res = await fetch(`${BASE}/historyapi/v1/getData/${datasetId}/${path}?Authorization=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(45_000) })
  if (!res.ok) throw new Error(`CWA history file ${datasetId} ${dateTime} responded ${res.status}`)
  return res.text()
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * CWA's history XML → the shape of its JSON: repeated siblings become an array, leaves are strings.
 * ponytail: elements only — no attributes, CDATA or self-nesting tags, which is all CWA's observation files contain
 * (checked on O-A0001-001). A real parser is the upgrade if a dataset ever needs more.
 */
export function xmlToObject(xml: string): any {
  const out: Record<string, any> = {}
  let any = false
  for (const [, tag, inner] of xml.matchAll(/<([A-Za-z_][\w.-]*)>([\s\S]*?)<\/\1>/g)) {
    any = true
    const v = xmlToObject(inner)
    out[tag] = tag in out ? [out[tag], v].flat() : v
  }
  return any ? out : xml.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])
}
