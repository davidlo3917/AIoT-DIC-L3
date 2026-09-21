import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Observation, Station } from '../../api'
import { mapExpression, RAMPS, type Variable } from '../../ramps'

const SOURCE = 'stations', DOTS = 'station-dots', LABELS = 'station-values'
const FIELD: Record<Variable, keyof Observation> = { temperature: 'temperature', humidity: 'humidity', rain: 'rain1h' }

export function addStationLayers(map: MapLibreMap, onSelect: (stationId: number | null) => void) {
  map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: DOTS, type: 'circle', source: SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 9, 5, 12, 8],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1.5],
      'circle-stroke-color': '#0b1220',
      'circle-color': '#ffffff',
      // At island scale ~850 dots would bury the surface they sit on; they fade in as you zoom toward a region.
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7.2, 0, 8, 1],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 7.2, 0, 8, 1],
    },
  })
  map.addLayer({
    id: LABELS, type: 'symbol', source: SOURCE, minzoom: 9,
    layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.2], 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': '#f1f5f9', 'text-halo-color': '#0b1220', 'text-halo-width': 1.4 },
  })
  map.on('click', DOTS, (e) => onSelect(Number(e.features?.[0]?.properties?.id)))
  map.on('click', (e) => { if (!map.queryRenderedFeatures(e.point, { layers: [DOTS] }).length) onSelect(null) })
  map.on('mouseenter', DOTS, () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', DOTS, () => (map.getCanvas().style.cursor = ''))
}

/** Only stations that have a reading for the active variable are drawn — a rain gauge has no temperature to show. */
export function updateStations(map: MapLibreMap, stations: Station[], observations: Observation[], variable: Variable, visible: boolean) {
  const ramp = RAMPS[variable], field = FIELD[variable]
  const byId = new Map(observations.map((o) => [o.stationId, o]))
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: stations.flatMap((s) => {
      const v = byId.get(s.id)?.[field] as number | null | undefined
      if (v == null) return []
      return [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] }, properties: { id: s.id, value: v, label: ramp.format(v) } }]
    }),
  })
  map.setPaintProperty(DOTS, 'circle-color', mapExpression(ramp, 'value') as never)
  // Dry gauges would bury the map in dots; for rain only show where it is actually raining.
  map.setFilter(DOTS, variable === 'rain' ? ['>=', ['get', 'value'], 0.5] : null)
  map.setFilter(LABELS, variable === 'rain' ? ['>=', ['get', 'value'], 0.5] : null)
  for (const id of [DOTS, LABELS]) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}
