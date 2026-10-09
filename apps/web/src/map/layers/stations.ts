import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Observation, Readings, Station } from '../../api'
import { mapExpression, RAMPS, type Variable } from '../../ramps'

const SOURCE = 'stations', DOTS = 'station-dots', LABELS = 'station-values'
export const FIELD: Record<Variable, keyof Readings> = { temperature: 'temperature', humidity: 'humidity', rain: 'rain1h', wind: 'windSpeed' }
/** On the map the unit is a sign after the number: 28.3°, 85%, 12.0 mm, 5.1 m/s (the legend and the card spell it out). */
export const sign = (unit: string) => unit === '°C' ? '°' : unit === '%' ? '%' : ` ${unit}`
// Zoomed out, only the most relevant stations are drawn, at least SPACING px apart; each zoom level in adds the next
// most relevant ones that fit, and from ALL_ZOOM on every station is drawn.
const FIRST_ZOOM = 5, ALL_ZOOM = 11, SPACING = 56 // wide enough for "12.3 m/s" at the label size of zoom 9–10, so a drawn dot has its value
const WORLD = 512 // MapLibre's world size in px at zoom 0

/**
 * The zoom from which each point is drawn. Points come most relevant first; once drawn at a zoom, a point stays drawn
 * at every closer one, so zooming in only ever adds stations.
 */
export function minZooms(points: [lon: number, lat: number][]): number[] {
  const xy = points.map(([lon, lat]) => [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2])
  const from = points.map(() => ALL_ZOOM)
  for (let z = FIRST_ZOOM; z < ALL_ZOOM; z++) {
    const scale = WORLD * 2 ** z / SPACING // one grid cell = SPACING px, so only the 3×3 cells around a point can be too close
    const cells = new Map<string, number[][]>()
    const place = (x: number, y: number) => { const k = `${Math.floor(x)},${Math.floor(y)}`; cells.set(k, [...cells.get(k) ?? [], [x, y]]) }
    const crowded = (x: number, y: number) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const [a, b] of cells.get(`${Math.floor(x) + dx},${Math.floor(y) + dy}`) ?? []) if ((a - x) ** 2 + (b - y) ** 2 < 1) return true
      }
      return false
    }
    xy.forEach(([x, y], i) => { if (from[i] < z) place(x * scale, y * scale) })
    xy.forEach(([x, y], i) => { if (from[i] >= z && !crowded(x * scale, y * scale)) { place(x * scale, y * scale); from[i] = z } })
  }
  return from
}

// CWA's staffed stations (46xxxx: 臺北, 臺中, 高雄…) are the ones people know, then its automatic stations (C0), then
// everyone else's. Within a tier the lower station wins, which favours the town over the peak above it.
const tier = (s: Station) => s.cwaStationId.startsWith('46') ? 0 : s.cwaStationId.startsWith('C0') ? 1 : 2
const byRelevance = (variable: Variable) => (a: { s: Station; v: number }, b: { s: Station; v: number }) =>
  variable === 'rain' ? b.v - a.v // where it rains hardest
    : tier(a.s) - tier(b.s) || (a.s.elevation ?? Infinity) - (b.s.elevation ?? Infinity) || a.s.id - b.s.id

export function addStationLayers(map: MapLibreMap, onSelect: (stationId: number | null) => void) {
  map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: DOTS, type: 'circle', source: SOURCE,
    layout: { visibility: 'none' },
    // Hidden stations are filtered out, not made transparent, so they cannot intercept clicks either.
    filter: ['>=', ['zoom'], ['get', 'minzoom']],
    paint: {
      // Sized to be read and tapped at city scale, where people actually look at single stations.
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4.5, 10, 7.5, 13, 11],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 11, 2],
      'circle-stroke-color': '#0b1220',
      'circle-color': '#ffffff',
    },
  })
  map.addLayer({
    id: LABELS, type: 'symbol', source: SOURCE, filter: ['>=', ['zoom'], ['get', 'minzoom']],
    // Anchored by its bottom edge so the value clears the dot at every size of both.
    layout: { visibility: 'none', 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 14.5, 12, 17],
      'text-anchor': 'bottom', 'text-offset': [0, -0.85], 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': '#f1f5f9', 'text-halo-color': '#0b1220', 'text-halo-width': 1.6 },
  })
  const click = (e: import('maplibre-gl').MapMouseEvent) => {
    const feature = map.queryRenderedFeatures(e.point, { layers: [DOTS] })[0]
    onSelect(feature ? Number(feature.properties.id) : null)
  }
  const enter = () => { map.getCanvas().style.cursor = 'pointer' }
  const leave = () => { map.getCanvas().style.cursor = '' }
  map.on('click', click)
  map.on('mouseenter', DOTS, enter)
  map.on('mouseleave', DOTS, leave)
  return () => {
    map.off('click', click)
    map.off('mouseenter', DOTS, enter)
    map.off('mouseleave', DOTS, leave)
    for (const id of [LABELS, DOTS]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

export function setStationsVisible(map: MapLibreMap, visible: boolean) {
  for (const id of [DOTS, LABELS]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  if (!visible) map.getCanvas().style.cursor = ''
}

/** Only stations that have a reading for the active variable are drawn — a rain gauge has no temperature to show. */
export function updateStations(map: MapLibreMap, stations: Station[], observations: Observation[], variable: Variable) {
  const ramp = RAMPS[variable], field = FIELD[variable]
  const byId = new Map(observations.map((o) => [o.stationId, o]))
  const shown = stations.flatMap((s) => {
    const v = byId.get(s.id)?.[field] as number | null | undefined
    // Dry gauges would bury the map in dots; for rain only show where it is actually raining.
    return v == null || (variable === 'rain' && v < 0.5) ? [] : [{ s, v }]
  }).sort(byRelevance(variable))
  const from = minZooms(shown.map(({ s }) => [s.longitude, s.latitude]))
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: shown.map(({ s, v }, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id, value: v, label: ramp.format(v) + sign(ramp.unit), minzoom: from[i] } })),
  })
  map.setPaintProperty(DOTS, 'circle-color', mapExpression(ramp, 'value') as never)
  setStationsVisible(map, true)
}
