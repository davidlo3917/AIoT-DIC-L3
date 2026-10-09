import { z } from 'zod'

// W-C0034-005: every active tropical cyclone in the West Pacific and South China Sea, with CWA's past fixes and its
// forecast positions (checked live 2026-10-09). Quantities come as strings and are simply absent when CWA has none.
export const TYPHOON_DATASET = 'W-C0034-005'

const num = z.string().optional().transform((s) => s != null && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : null)
const circle = z.object({ Radius: num }).optional()
const fix = z.object({
  DateTime: z.string().optional(), InitialTime: z.string().optional(), ForecastHour: num,
  CoordinateLongitude: z.coerce.number(), CoordinateLatitude: z.coerce.number(),
  MaxWindSpeed: num, MaxGustSpeed: num, Pressure: num, MovingSpeed: num, MovingDirection: z.string().optional(),
  Circle15ms: circle, Circle25ms: circle, Radius70PercentProbability: num,
})
const response = z.object({ records: z.object({ TropicalCyclones: z.object({ TropicalCyclone: z.array(z.object({
  TyphoonName: z.string().optional(), CwaTyphoonName: z.string().optional(), CwaTyNo: z.string().optional(), CwaTdNo: z.string().optional(),
  AnalysisData: z.object({ Fix: z.array(fix) }).optional(), ForecastData: z.object({ Fix: z.array(fix) }).optional(),
})).default([]) }).optional() }) })

/** One position of a cyclone: wind speeds in m/s, pressure in hPa, radii in km (r70 = where the centre lands with 70% probability). */
export type Fix = { time: string; lon: number; lat: number; wind: number | null; gust: number | null; pressure: number | null
  speed: number | null; direction: string | null; r15: number | null; r25: number | null; r70: number | null }
/** `name` is the international name, `cwaName` CWA's Chinese one; both are empty for a tropical depression that has only a TD number. */
export type Cyclone = { name: string | null; cwaName: string | null; number: string | null; td: string | null; analysis: Fix[]; forecast: Fix[] }

const text = (s: string | undefined) => s?.trim() || null
const iso = (ms: number) => Number.isNaN(ms) ? null : new Date(ms).toISOString()

/** Active cyclones, each with past fixes then forecast fixes in time order; a fix without a readable time is dropped. */
export function normalizeTyphoons(raw: unknown): Cyclone[] {
  return (response.parse(raw).records.TropicalCyclones?.TropicalCyclone ?? []).map((tc) => {
    const convert = (f: z.infer<typeof fix>, time: string | null): Fix[] => time ? [{
      time, lon: f.CoordinateLongitude, lat: f.CoordinateLatitude, wind: f.MaxWindSpeed, gust: f.MaxGustSpeed, pressure: f.Pressure,
      speed: f.MovingSpeed, direction: text(f.MovingDirection), r15: f.Circle15ms?.Radius ?? null, r25: f.Circle25ms?.Radius ?? null, r70: f.Radius70PercentProbability,
    }] : []
    return {
      name: text(tc.TyphoonName), cwaName: text(tc.CwaTyphoonName), number: text(tc.CwaTyNo), td: text(tc.CwaTdNo),
      analysis: (tc.AnalysisData?.Fix ?? []).flatMap((f) => convert(f, iso(Date.parse(f.DateTime ?? '')))),
      forecast: (tc.ForecastData?.Fix ?? []).flatMap((f) => convert(f, f.ForecastHour == null ? null : iso(Date.parse(f.InitialTime ?? '') + f.ForecastHour * 3600e3))),
    }
  })
}
