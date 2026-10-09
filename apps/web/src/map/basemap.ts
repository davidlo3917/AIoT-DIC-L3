import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'

export const MAP_COLORS = { ocean: '#0b1220', land: '#334155', line: '#94a3b8', label: '#cbd5e1' }
/** The opening view, and the box (Taiwan + surrounding sea, the radar crop) outside which a viewer has wandered off to a typhoon. */
export const HOME = { center: [120.97, 23.7] as [number, number], zoom: 6.5, bounds: [115, 17.75, 126.5, 29.25] as const }
export const REFERENCE_LAYER = 'weather-main-roads'
// Traditional Chinese first, then whatever the tile has: a place with no Chinese name still gets a label.
const NAMES = ['name:zh-Hant', 'name:zh', 'name:nonlatin', 'name', 'name:en', 'name_en']
export const placeName: ExpressionSpecification = NAMES.reduceRight<ExpressionSpecification>((fallback, key) =>
  ['case', ['all', ['has', key], ['!=', ['get', key], ''], ['!=', ['get', key], null]], ['to-string', ['get', key]], fallback], ['literal', ''])
const places: Record<string, [number, number, number]> = {
  place_city_large: [5, 24, 16], place_city: [6, 24, 14], place_town: [10, 24, 13],
  place_state: [6, 9, 13], place_country_other: [0, 6, 14],
  place_country_minor: [0, 6, 14], place_country_major: [0, 6, 14],
}

/** An allowlist prevents new provider detail layers from silently adding clutter. */
export function weatherBasemap(style: StyleSpecification): StyleSpecification {
  const base = style.layers.filter((l) => l.id === 'background' || l.id === 'water').map((l): LayerSpecification => {
    if (l.type === 'background') return { ...l, paint: { 'background-color': MAP_COLORS.land } }
    if (l.type === 'fill') return { ...l, paint: { 'fill-color': MAP_COLORS.ocean, 'fill-antialias': true } }
    return l
  })
  const roads: LayerSpecification = {
    id: REFERENCE_LAYER, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 9,
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MAP_COLORS.line, 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.5] },
  }
  const boundaries = style.layers.filter((l) => l.id.startsWith('boundary_')).map((l): LayerSpecification =>
    l.type === 'line' ? { ...l, paint: { ...l.paint, 'line-color': MAP_COLORS.line, 'line-opacity': 0.4, 'line-width': 0.8 } } : l)
  const labels = style.layers.filter((l) => l.id in places).map((l): LayerSpecification => {
    if (l.type !== 'symbol') return l
    const [minzoom, maxzoom, size] = places[l.id]
    return { ...l, minzoom, maxzoom,
      layout: { 'text-field': placeName, 'text-font': ['Noto Sans Regular'], 'text-size': size,
        'text-anchor': 'center', 'text-justify': 'center', 'text-padding': 8, 'text-max-width': 12 },
      paint: { 'text-color': MAP_COLORS.label, 'text-halo-color': MAP_COLORS.ocean, 'text-halo-width': 1.5 },
    }
  })
  return { ...style, layers: [...base, roads, ...boundaries, ...labels] }
}
