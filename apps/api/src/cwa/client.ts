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
