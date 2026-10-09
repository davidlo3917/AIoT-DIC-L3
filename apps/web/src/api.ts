// Shapes mirror apps/api/src/routes/public.ts.
export type Station = { id: number; cwaStationId: string; name: string; county: string | null; town: string | null; latitude: number; longitude: number; elevation: number | null }
export type Readings = { temperature: number | null; humidity: number | null; pressure: number | null; windSpeed: number | null; windDirection: number | null; gustSpeed: number | null; rain1h: number | null; rain24h: number | null }
export type Observation = Readings & { stationId: number; observedAt: string }
export type GridMeta = { encoding: 'rg16'; offset: number; scale: number; unit: string; width: number; height: number }
export type Frame = { time: string; url?: string; bounds?: [number, number, number, number]; meta?: GridMeta | null } // encoded grids only; radar is a plain picture
export type FrameLayer = 'stations' | 'temperature-grid' | 'rain-grid' | 'radar'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

export const PLAYBACK_DAYS = 7 // what the database keeps
// The start of the playback window, rounded down to the hour so every visitor in that hour asks the CDN the same URL.
const since = () => new Date(Math.floor((Date.now() - PLAYBACK_DAYS * 86400e3) / 3600e3) * 3600e3).toISOString()

export const getStations = () => get<Station[]>('/stations')
export const getFrames = (layer: FrameLayer, signal?: AbortSignal) => get<{ frames: Frame[] }>(`/frames?layer=${layer}&from=${since()}`, signal).then((r) => r.frames)
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
export type ForecastPeriod = { start: string; end: string; weather: string | null; weatherCode: string | null; min: number | null; max: number | null; rainChance: number | null }
export const getForecast = (county: string, town: string, signal?: AbortSignal) =>
  get<{ periods: ForecastPeriod[] }>(`/forecast?county=${encodeURIComponent(county)}&town=${encodeURIComponent(town)}`, signal).then((r) => r.periods)
/** The station's whole playback window, fetched once per card: the chart then follows the map time without refetching. */
export const getHistory = (cwaId: string, signal?: AbortSignal) => get<{ observations: (Readings & { observedAt: string })[] }>(`/stations/${cwaId}/history?from=${since()}`, signal).then((r) => r.observations)
