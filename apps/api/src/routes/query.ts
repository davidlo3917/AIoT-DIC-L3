import { z } from 'zod'
import { COUNTY_FORECASTS } from '../cwa/forecast.js'

const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s))

export const MAX_RANGE_DAYS = 8 // a little over the 7-day retention window

/** `?from=&to=` — ISO-8601 with offset. Defaults to the last 24 h ending now. */
export const rangeQuery = z.object({ from: instant.optional(), to: instant.optional() }).transform((q, ctx) => {
  const to = q.to ?? new Date()
  const from = q.from ?? new Date(to.getTime() - 24 * 3600e3)
  if (from >= to) ctx.addIssue({ code: 'custom', message: '`from` must be before `to`' })
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86400e3) ctx.addIssue({ code: 'custom', message: `range is limited to ${MAX_RANGE_DAYS} days` })
  return { from, to }
})

/** `?at=` — defaults to now. */
export const atQuery = z.object({ at: instant.optional() }).transform((q) => ({ at: q.at ?? new Date() }))

export const LAYERS = ['stations', 'radar', 'satellite', 'wind', 'rain-grid', 'temperature-grid'] as const
export const layerQuery = z.object({ layer: z.enum(LAYERS) })

// CWA station ids are short alphanumerics ("466940", "C0TB40"); reject anything else before it reaches SQL or logs.
export const stationIdParam = z.string().regex(/^[A-Za-z0-9]{4,12}$/)

/** `?county=&town=` for a township forecast: a known county, and a township name shaped like one (三地門鄉, 臺東市…). */
export const forecastQuery = z.object({
  county: z.enum(Object.keys(COUNTY_FORECASTS) as [keyof typeof COUNTY_FORECASTS]),
  town: z.string().regex(/^\p{Script=Han}{1,5}[鄉鎮市區]$/u),
})

/** `?layer=` for the grid ingest endpoint: fetch that one product only (the extra radar job), or all of them when absent. */
export const gridsQuery = z.object({ layer: z.enum(['temperature-grid', 'rain-grid', 'radar']).optional() })
export type GridLayer = NonNullable<z.infer<typeof gridsQuery>['layer']>

/** `?before=&limit=` for the backfill endpoint: a cursor and a batch size small enough for one serverless invocation. */
export const backfillQuery = z.object({ before: instant.optional(), limit: z.coerce.number().int().min(1).max(24).default(6) })
