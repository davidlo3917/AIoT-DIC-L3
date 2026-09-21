// Shapes mirror apps/api/src/routes/public.ts.
export type Station = { id: number; cwaStationId: string; name: string; county: string | null; town: string | null; latitude: number; longitude: number; elevation: number | null }
export type Readings = { temperature: number | null; humidity: number | null; pressure: number | null; windSpeed: number | null; windDirection: number | null; gustSpeed: number | null; rain1h: number | null; rain24h: number | null }
export type Observation = Readings & { stationId: number; observedAt: string }
export type GridMeta = { encoding: 'rg16'; offset: number; scale: number; unit: string; width: number; height: number }
export type Frame = { time: string; url?: string; bounds?: [number, number, number, number]; meta?: GridMeta }
export type FrameLayer = 'stations' | 'temperature-grid' | 'rain-grid'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

export const getStations = () => get<Station[]>('/stations')
export const getFrames = (layer: FrameLayer, signal?: AbortSignal) => get<{ frames: Frame[] }>(`/frames?layer=${layer}`, signal).then((r) => r.frames)
export const getObservations = (at: string, signal?: AbortSignal) => get<{ observations: Observation[] }>(`/observations?at=${encodeURIComponent(at)}`, signal).then((r) => r.observations)
export const getHistory = (cwaId: string, signal?: AbortSignal) => get<{ observations: (Readings & { observedAt: string })[] }>(`/stations/${cwaId}/history`, signal).then((r) => r.observations)
