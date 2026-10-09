import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Cyclone } from '../../api'
import { shortDayTime, t } from '../../i18n'

// Minimal GeoJSON shapes: @types/geojson is MapLibre's dependency, not ours, and these four lines are all this file needs.
type Position = [number, number]
type Geometry = { type: 'Point'; coordinates: Position } | { type: 'LineString'; coordinates: Position[] } | { type: 'Polygon'; coordinates: Position[][] }
type Feature = { type: 'Feature'; properties: { kind: string; label?: string }; geometry: Geometry }
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] }

const SOURCE = 'typhoons'
const FILL = { 'typhoon-r70': ['#cbd5e1', 0.07], 'typhoon-r15': ['#facc15', 0.15], 'typhoon-r25': ['#f97316', 0.22] } as const
const LAYERS = [...Object.keys(FILL), 'typhoon-track', 'typhoon-forecast', 'typhoon-points', 'typhoon-labels']

/** A closed ring `km` around a point. ponytail: equirectangular, a few km off at 200 km; fine for a wind radius drawn on a map. */
export function ring([lon, lat]: [number, number], km: number, n = 48): [number, number][] {
  const dLat = km / 111.32, dLon = dLat / Math.cos((lat * Math.PI) / 180)
  return Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)] })
}

export const cycloneName = (c: Cyclone) => c.cwaName ?? c.name ?? t('typhoon.td')

/** West, south, east, north of everything drawn for one cyclone, or null when it has no fix at all. */
export function cycloneBounds(c: Cyclone): [number, number, number, number] | null {
  const fixes = [...c.analysis, ...c.forecast]
  if (!fixes.length) return null
  const pad = (f: { r70: number | null; r15: number | null }) => ((f.r70 ?? f.r15 ?? 0) / 111.32) * 1.2
  return [Math.min(...fixes.map((f) => f.lon - pad(f))), Math.min(...fixes.map((f) => f.lat - pad(f))), Math.max(...fixes.map((f) => f.lon + pad(f))), Math.max(...fixes.map((f) => f.lat + pad(f)))]
}

/** Past track, forecast track, the positions, and the wind radii at the current fix plus the 70 % circles ahead. */
export function typhoonFeatures(cyclones: Cyclone[]): FeatureCollection {
  const features: Feature[] = []
  const polygon = (kind: string, center: [number, number], km: number) =>
    features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: [ring(center, km)] } })
  const point = (kind: string, [lon, lat]: [number, number], label = '') =>
    features.push({ type: 'Feature', properties: { kind, label }, geometry: { type: 'Point', coordinates: [lon, lat] } })
  for (const c of cyclones) {
    const past = c.analysis.map((f): [number, number] => [f.lon, f.lat]), ahead = c.forecast.map((f): [number, number] => [f.lon, f.lat])
    const now = c.analysis.at(-1)
    if (past.length > 1) features.push({ type: 'Feature', properties: { kind: 'track' }, geometry: { type: 'LineString', coordinates: past } })
    if (ahead.length) features.push({ type: 'Feature', properties: { kind: 'forecast' }, geometry: { type: 'LineString', coordinates: [...(now ? [[now.lon, now.lat] as [number, number]] : []), ...ahead] } })
    for (const f of c.forecast) if (f.r70) polygon('r70', [f.lon, f.lat], f.r70)
    if (now?.r15) polygon('r15', [now.lon, now.lat], now.r15)
    if (now?.r25) polygon('r25', [now.lon, now.lat], now.r25)
    if (now) point('now', [now.lon, now.lat], cycloneName(c)) // first: labels are placed in order, and the name must win a collision
    past.slice(0, -1).forEach((p) => point('past', p))
    c.forecast.forEach((f) => point('fc', [f.lon, f.lat], shortDayTime.format(new Date(f.time))))
  }
  return { type: 'FeatureCollection', features }
}

export function addTyphoonLayers(map: MapLibreMap) {
  map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  for (const [id, [color, opacity]] of Object.entries(FILL)) {
    map.addLayer({ id, type: 'fill', source: SOURCE, filter: ['==', ['get', 'kind'], id.slice('typhoon-'.length)], paint: { 'fill-color': color, 'fill-opacity': opacity, 'fill-outline-color': color } })
  }
  map.addLayer({ id: 'typhoon-track', type: 'line', source: SOURCE, filter: ['==', ['get', 'kind'], 'track'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e2e8f0', 'line-width': 2 } })
  map.addLayer({ id: 'typhoon-forecast', type: 'line', source: SOURCE, filter: ['==', ['get', 'kind'], 'forecast'], paint: { 'line-color': '#e2e8f0', 'line-width': 2, 'line-dasharray': [2, 2] } })
  map.addLayer({
    id: 'typhoon-points', type: 'circle', source: SOURCE, filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': ['match', ['get', 'kind'], 'now', 7, 'fc', 4, 3], 'circle-color': ['match', ['get', 'kind'], 'now', '#f97316', 'fc', '#fde68a', '#e2e8f0'], 'circle-stroke-color': '#0b1220', 'circle-stroke-width': 1.5 },
  })
  map.addLayer({
    id: 'typhoon-labels', type: 'symbol', source: SOURCE, filter: ['!=', ['get', 'label'], ''],
    layout: { 'text-field': ['get', 'label'], 'text-size': ['match', ['get', 'kind'], 'now', 15, 11], 'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': '#f8fafc', 'text-halo-color': '#0b1220', 'text-halo-width': 1.5 },
  })
  return () => {
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

export function updateTyphoons(map: MapLibreMap, cyclones: Cyclone[]) {
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(typhoonFeatures(cyclones))
}
