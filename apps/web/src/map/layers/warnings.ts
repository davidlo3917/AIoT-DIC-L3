import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
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

/** The counties under an advisory, each painted with its most severe one. A county CWA names that the atlas lacks is simply not drawn. */
export function warningFeatures(counties: Counties, warnings: Warning[]) {
  const worst = new Map<string, Warning>()
  for (const w of warnings) for (const name of w.counties) if (rank(w.phenomena) < rank(worst.get(name)?.phenomena ?? '')) worst.set(name, w)
  return {
    type: 'FeatureCollection' as const,
    features: counties.features.flatMap((f) => {
      const w = worst.get(f.properties.name)
      return w ? [{ ...f, properties: { name: f.properties.name, phenomena: w.phenomena, color: warningColor(w.phenomena) } }] : []
    }),
  }
}

export function addWarningLayers(map: MapLibreMap) {
  map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // A tint plus a firm outline: the outline says where, the tint stays light enough to read the weather underneath.
  map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } })
  map.addLayer({ id: LINE, type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9 } })
  return () => {
    for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

export function updateWarnings(map: MapLibreMap, counties: Counties | null, warnings: Warning[]) {
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(counties && warnings.length ? warningFeatures(counties, warnings) as never : { type: 'FeatureCollection', features: [] })
}
