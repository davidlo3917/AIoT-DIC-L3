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
