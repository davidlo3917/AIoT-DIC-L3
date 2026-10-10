// Shapes mirror apps/api/src/routes/public.ts.
export type Station = { id: number; cwaStationId: string; name: string; county: string | null; town: string | null; latitude: number; longitude: number; elevation: number | null }
export type Readings = { temperature: number | null; humidity: number | null; pressure: number | null; windSpeed: number | null; windDirection: number | null; gustSpeed: number | null; rain1h: number | null; rain24h: number | null }
export type Observation = Readings & { stationId: number }
type GridMeta = { encoding: 'rg16'; offset: number; scale: number; width: number; height: number }
type WindMeta = { encoding: 'uv8'; width: number; height: number; run: string } // mirrors ingestion/wind.ts
export type Frame = { time: string; url?: string; bounds?: [number, number, number, number]; meta?: GridMeta | WindMeta | null // encoded grids only; radar and satellite are plain pictures
  between?: [Frame, Frame, number] } // browser only: an hourly wind frame blended from the two CWA frames around it, this far from the first
export type FrameLayer = 'stations' | 'temperature-grid' | 'rain-grid' | 'radar' | 'satellite' | 'wind'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

export const PLAYBACK_DAYS = 7 // what the database keeps
const FORECAST_DAYS = 4 // the wind forecast reaches 3.5 days ahead
// The ends of the playback window, rounded down to the hour so every visitor in that hour asks the CDN the same URL.
const hour = (days: number) => new Date(Math.floor((Date.now() + days * 86400e3) / 3600e3) * 3600e3).toISOString()

export const getStations = () => get<Station[]>('/stations')
// Only the wind layer has frames beyond now; for the others the server's default `to` (now) keeps the URL stable for an hour.
export const getFrames = (layer: FrameLayer, signal?: AbortSignal) =>
  get<{ frames: Frame[] }>(`/frames?layer=${layer}&from=${hour(-PLAYBACK_DAYS)}${layer === 'wind' ? `&to=${hour(FORECAST_DAYS)}` : ''}`, signal).then((r) => r.frames)
// One request per instant, shared by the station dots, the humidity surface and the playback preloader. Not abortable:
// the server runs an abandoned query to the end anyway, so aborting only threw away an answer replay would want.
const observations = new Map<string, Promise<Observation[]>>()
export const invalidateObservations = () => observations.clear()
export function getObservations(at: string): Promise<Observation[]> {
  let hit = observations.get(at)
  if (!hit) {
    hit = get<{ observations: Observation[] }>(`/observations?at=${encodeURIComponent(at)}`).then((r) => r.observations)
    observations.set(at, hit)
    // Stations keep reporting for a while after the instant itself (CWA publishes ~15 min late): only the settled past is kept.
    const settled = Date.now() - Date.parse(at) > 30 * 60e3
    const current = hit
    const drop = () => { if (observations.get(at) === current) observations.delete(at) }
    hit.then((rows) => { if (!settled || !rows.length) drop() }, drop)
    if (observations.size > 60) observations.delete(observations.keys().next().value!)
  }
  return hit
}
export type ForecastPeriod = { start: string; end: string; weather: string | null; min: number | null; max: number | null; rainChance: number | null }
// One request per township, shared by the station card, the county card and the forecast layer's 22 counties, and kept
// for the CDN's half hour so the map and the cards never disagree. A failure is kept as well, so a bad hour costs one
// request per township and not 22 per frame; Retry clears it.
const forecasts = new Map<string, { at: number; periods: Promise<ForecastPeriod[]> }>()
export const invalidateForecasts = () => forecasts.clear()
export function getForecast(county: string, town: string): Promise<ForecastPeriod[]> {
  const key = `${county}/${town}`, hit = forecasts.get(key)
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.periods
  const periods = get<{ periods: ForecastPeriod[] }>(`/forecast?county=${encodeURIComponent(county)}&town=${encodeURIComponent(town)}`).then((r) => r.periods)
  forecasts.set(key, { at: Date.now(), periods })
  return periods
}
// Shapes mirror apps/api/src/cwa/typhoon.ts: wind in m/s, pressure in hPa, radii in km.
export type Fix = { time: string; lon: number; lat: number; wind: number | null; pressure: number | null; r15: number | null; r25: number | null; r70: number | null }
export type Cyclone = { name: string | null; cwaName: string | null; analysis: Fix[]; forecast: Fix[] }
export const getTyphoons = (signal?: AbortSignal) => get<{ cyclones: Cyclone[] }>('/typhoons', signal).then((r) => r.cyclones)
// Shapes mirror apps/api/src/cwa/warnings.ts.
export type Warning = { phenomena: string; significance: string; start: string; end: string; counties: string[]; text: string | null }
export const getWarnings = (signal?: AbortSignal) => get<{ warnings: Warning[] }>('/warnings', signal).then((r) => r.warnings)
/** The station's whole playback window, fetched once per card: the chart then follows the map time without refetching. */
export const getHistory = (cwaId: string, signal?: AbortSignal) => get<{ observations: (Readings & { observedAt: string })[] }>(`/stations/${cwaId}/history?from=${hour(-PLAYBACK_DAYS)}`, signal).then((r) => r.observations)
