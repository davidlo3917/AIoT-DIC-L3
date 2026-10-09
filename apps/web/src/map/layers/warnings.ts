import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Warning } from '../../api'

const SOURCE = 'warnings', FILL = 'warning-fill', LINE = 'warning-line'

// CWA's own colour language where it has one (rain advisories run blue → orange → red → purple with severity); the
// order is the severity, so a county under two advisories is painted with the one listed first.
export const WARNING_COLORS: [RegExp, string][] = [
  [/超大豪雨/, '#a855f7'], [/大豪雨/, '#ef4444'], [/豪雨/, '#f97316'], [/大雨/, '#3b82f6'], [/颱風/, '#ef4444'],
  [/雷雨/, '#f97316'], [/強風/, '#eab308'], [/低溫/, '#38bdf8'], [/濃霧/, '#9ca3af'],
]
const rank = (phenomena: string) => { const i = WARNING_COLORS.findIndex(([re]) => re.test(phenomena)); return i < 0 ? WARNING_COLORS.length : i }
export const warningColor = (phenomena: string) => WARNING_COLORS[rank(phenomena)]?.[1] ?? '#f97316'

/** `public/counties.json`: the 22 counties from taiwan-atlas (MIT, MOI boundaries), named the way CWA names them (臺, not 台). */
export type Counties = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { name: string }; geometry: unknown }[] }

/**
 * The counties under an advisory, each painted with its most severe one; the counties of the advisory the viewer opened
 * (`focus`) are marked so the map can stress them. A county CWA names that the atlas lacks is simply not drawn.
 */
export function warningFeatures(counties: Counties, warnings: Warning[], focus: number | null = null) {
  const worst = new Map<string, Warning>()
  for (const w of warnings) for (const name of w.counties) if (rank(w.phenomena) < rank(worst.get(name)?.phenomena ?? '')) worst.set(name, w)
  const focused = new Set(focus == null ? [] : warnings[focus]?.counties ?? [])
  return {
    type: 'FeatureCollection' as const,
    features: counties.features.flatMap((f) => {
      const w = worst.get(f.properties.name)
      return w ? [{ ...f, properties: { name: f.properties.name, phenomena: w.phenomena, color: warningColor(w.phenomena), focused: focused.has(f.properties.name) } }] : []
    }),
  }
}

/** West, south, east, north around the named counties, or null when none of them is in the file. */
export function countyBounds(counties: Counties, names: string[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const walk = (c: unknown) => {
    if (typeof (c as number[])[0] === 'number') { const [x, y] = c as [number, number]; w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y) }
    else for (const inner of c as unknown[]) walk(inner)
  }
  for (const f of counties.features) if (names.includes(f.properties.name)) walk((f.geometry as { coordinates: unknown }).coordinates)
  return Number.isFinite(w) ? [w, s, e, n] : null
}

export function addWarningLayers(map: MapLibreMap) {
  map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // A tint plus a firm outline: the outline says where, the tint stays light enough to read the weather underneath.
  // The advisory the viewer opened gets a heavier tint and line, so its counties stand out from any other advisory's.
  const focused: ExpressionSpecification = ['boolean', ['get', 'focused'], false]
  map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', focused, 0.4, 0.15] } })
  map.addLayer({ id: LINE, type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', focused, 4, 2.5], 'line-opacity': 0.9 } })
  return () => {
    for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

export function updateWarnings(map: MapLibreMap, counties: Counties | null, warnings: Warning[], focus: number | null = null) {
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(counties && warnings.length ? warningFeatures(counties, warnings, focus) as never : { type: 'FeatureCollection', features: [] })
}
