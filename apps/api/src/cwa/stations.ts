import { z } from 'zod'

// CWA sends every number as a string and marks "missing" with sentinels: "-99" almost everywhere,
// "-990.0" seen on precipitation. Nothing real in Taiwan is below -90 (Yushan's record low is about -18°C).
export const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > -90 ? n : null
}
const int = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n) }

const precipitation = z.object({ Precipitation: z.string() }).optional()

// Shared by O-A0001-001 / O-A0003-001 (WeatherElement) and O-A0002-001 (RainfallElement).
// Only the fields we persist are declared; zod drops the rest.
const rawStation = z.object({
  StationId: z.string().min(1),
  StationName: z.string(),
  ObsTime: z.object({ DateTime: z.iso.datetime({ offset: true }) }),
  GeoInfo: z.object({
    Coordinates: z.array(z.object({ CoordinateName: z.string(), StationLatitude: z.string(), StationLongitude: z.string() })),
    StationAltitude: z.string().optional(),
    CountyName: z.string().optional(),
    TownName: z.string().optional(),
  }),
  WeatherElement: z.object({
    AirTemperature: z.string().optional(),
    RelativeHumidity: z.string().optional(),
    AirPressure: z.string().optional(),
    WindSpeed: z.string().optional(),
    WindDirection: z.string().optional(),
    GustInfo: z.object({ PeakGustSpeed: z.string().optional() }).optional(),
  }).optional(),
  RainfallElement: z.object({ Past1hr: precipitation, Past24hr: precipitation }).optional(),
})

export const datastoreResponse = z.object({ records: z.object({ Station: z.array(z.unknown()) }) })

export type NormalizedStation = NonNullable<ReturnType<typeof normalizeStation>>

/** Returns null for records we can't place on a map; one bad station must not fail the whole ingest. */
export function normalizeStation(raw: unknown) {
  const p = rawStation.safeParse(raw)
  if (!p.success) return null
  const s = p.data
  // Each record carries TWD67 *and* WGS84, ~800 m apart. Web maps are WGS84.
  const c = s.GeoInfo.Coordinates.find((x) => x.CoordinateName === 'WGS84')
  const latitude = num(c?.StationLatitude), longitude = num(c?.StationLongitude)
  if (latitude == null || longitude == null) return null
  const w = s.WeatherElement, r = s.RainfallElement
  return {
    station: {
      cwaStationId: s.StationId,
      name: s.StationName,
      county: s.GeoInfo.CountyName ?? null,
      town: s.GeoInfo.TownName ?? null,
      latitude,
      longitude,
      elevation: num(s.GeoInfo.StationAltitude),
    },
    observation: {
      observedAt: new Date(s.ObsTime.DateTime),
      temperature: num(w?.AirTemperature),
      humidity: int(w?.RelativeHumidity),
      pressure: num(w?.AirPressure),
      windSpeed: num(w?.WindSpeed),
      windDirection: int(w?.WindDirection),
      gustSpeed: num(w?.GustInfo?.PeakGustSpeed),
      rain1h: num(r?.Past1hr?.Precipitation),
      rain24h: num(r?.Past24hr?.Precipitation),
    },
  }
}
