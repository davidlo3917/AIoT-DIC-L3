import { z } from 'zod'

/** Each county's "townships, 1 week, every 12 h" dataset (F-D0047-003 … -087, every fourth id), checked live 2026-10-09. */
export const COUNTY_FORECASTS = {
  宜蘭縣: 'F-D0047-003', 桃園市: 'F-D0047-007', 新竹縣: 'F-D0047-011', 苗栗縣: 'F-D0047-015', 彰化縣: 'F-D0047-019',
  南投縣: 'F-D0047-023', 雲林縣: 'F-D0047-027', 嘉義縣: 'F-D0047-031', 屏東縣: 'F-D0047-035', 臺東縣: 'F-D0047-039',
  花蓮縣: 'F-D0047-043', 澎湖縣: 'F-D0047-047', 基隆市: 'F-D0047-051', 新竹市: 'F-D0047-055', 嘉義市: 'F-D0047-059',
  臺北市: 'F-D0047-063', 高雄市: 'F-D0047-067', 新北市: 'F-D0047-071', 臺中市: 'F-D0047-075', 臺南市: 'F-D0047-079',
  連江縣: 'F-D0047-083', 金門縣: 'F-D0047-087',
} as const

// Asking CWA for only these keeps one township's answer at ~9 KB instead of the county's ~750 KB.
export const ELEMENTS = ['天氣現象', '最高溫度', '最低溫度', '12小時降雨機率'] as const

const value = z.record(z.string(), z.string())
const response = z.object({ records: z.object({ Locations: z.array(z.object({ Location: z.array(z.object({
  LocationName: z.string(),
  WeatherElement: z.array(z.object({ ElementName: z.string(), Time: z.array(z.object({ StartTime: z.string(), EndTime: z.string(), ElementValue: z.array(value) })) })),
})) })) }) })

export type ForecastPeriod = { start: string; end: string; weather: string | null; weatherCode: string | null; min: number | null; max: number | null; rainChance: number | null }

// CWA writes "-" where it has no number (the rain chance for days 4–7).
const int = (s: string | undefined) => s != null && /^-?\d+$/.test(s.trim()) ? Number(s) : null

/** One township's periods in time order, or null when CWA does not know the township. */
export function normalizeForecast(raw: unknown): ForecastPeriod[] | null {
  const location = response.parse(raw).records.Locations[0]?.Location[0]
  if (!location) return null
  const at = (name: string) => new Map(location.WeatherElement.find((e) => e.ElementName === name)?.Time.map((t) => [t.StartTime, t.ElementValue[0]]))
  const [weather, max, min, rain] = ELEMENTS.map(at)
  const periods = location.WeatherElement.find((e) => e.ElementName === '天氣現象')?.Time ?? []
  return periods.map(({ StartTime, EndTime }) => ({
    start: new Date(StartTime).toISOString(), end: new Date(EndTime).toISOString(),
    weather: weather.get(StartTime)?.Weather ?? null, weatherCode: weather.get(StartTime)?.WeatherCode ?? null,
    min: int(min.get(StartTime)?.MinTemperature), max: int(max.get(StartTime)?.MaxTemperature),
    rainChance: int(rain.get(StartTime)?.ProbabilityOfPrecipitation),
  }))
}
