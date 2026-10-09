import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Warning } from '../../api'

const SOURCE = 'warnings', FILL = 'warning-fill', CASING = 'warning-casing', LINE = 'warning-line'
// One highlight colour, chosen to belong to no layer's ramp (those run blue → green → yellow → red → purple, radar
// starts cyan): hot pink over a white casing reads on the dark sea and on a bright temperature field alike.
const HIGHLIGHT = '#ff2bd6'

// For the panel's dots: CWA's own colour language where it has one (rain advisories run blue → orange → red → purple with severity).
export const WARNING_COLORS: [RegExp, string][] = [
  [/超大豪雨/, '#a855f7'], [/大豪雨/, '#ef4444'], [/豪雨/, '#f97316'], [/大雨/, '#3b82f6'], [/颱風/, '#ef4444'],
  [/雷雨/, '#f97316'], [/強風/, '#eab308'], [/低溫/, '#38bdf8'], [/濃霧/, '#9ca3af'],
]
export const warningColor = (phenomena: string) => WARNING_COLORS.find(([re]) => re.test(phenomena))?.[1] ?? '#f97316'

/** `public/counties.json`: the 22 counties from taiwan-atlas (MIT, MOI boundaries), named the way CWA names them (臺, not 台). */
export type Counties = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { name: string }; geometry: unknown }[] }

/** The counties of the one advisory the viewer opened (`focus`); nothing while none is open. A county CWA names that the atlas lacks is simply not drawn. */
export function warningFeatures(counties: Counties, warnings: Warning[], focus: number | null) {
  const names = new Set(focus == null ? [] : warnings[focus]?.counties ?? [])
  return { type: 'FeatureCollection' as const, features: counties.features.filter((f) => names.has(f.properties.name)) }
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
  // A light tint says which counties, the cased outline says exactly where, and the weather underneath stays readable.
  map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': HIGHLIGHT, 'fill-opacity': 0.22 } })
  map.addLayer({ id: CASING, type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': 0.85 } })
  map.addLayer({ id: LINE, type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': HIGHLIGHT, 'line-width': 3 } })
  return () => {
    for (const id of [LINE, CASING, FILL]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

export function updateWarnings(map: MapLibreMap, counties: Counties | null, warnings: Warning[], focus: number | null) {
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(counties ? warningFeatures(counties, warnings, focus) as never : { type: 'FeatureCollection', features: [] })
}
