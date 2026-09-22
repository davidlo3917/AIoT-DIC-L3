import assert from 'node:assert/strict'
import test from 'node:test'
import { createExpression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import type { StyleSpecification } from 'maplibre-gl'
import { MAP_COLORS, PLACE_NAME, REFERENCE_LAYER, weatherBasemap } from './basemap'

const fixture: StyleSpecification = {
  version: 8, glyphs: 'https://example.test/fonts/{fontstack}/{range}.pbf',
  sources: { openmaptiles: { type: 'vector', url: 'https://example.test/tiles', attribution: 'Map contributors' } },
  layers: [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
    ...['building', 'park', 'landuse_residential', 'future_provider_detail'].map((id) => ({ id, type: 'fill' as const, source: 'openmaptiles', 'source-layer': id })),
    ...['railway', 'highway_minor', 'boundary_state'].map((id) => ({ id, type: 'line' as const, source: 'openmaptiles', 'source-layer': id })),
    ...['place_city_large', 'place_city', 'place_town', 'place_village', 'place_suburb', 'highway_ref'].map((id) => ({
      id, type: 'symbol' as const, source: 'openmaptiles', 'source-layer': 'place',
      layout: { 'icon-image': 'circle-11', 'text-field': '{name}' },
    })),
  ],
}

test('weather style is valid, removes clutter, and preserves the mask and references in order', () => {
  const style = weatherBasemap(fixture)
  assert.deepEqual(validateStyleMin(style), [])
  assert.deepEqual(style.layers.map((l) => l.id), ['background', 'water', REFERENCE_LAYER, 'boundary_state', 'place_city_large', 'place_city', 'place_town'])
  assert.deepEqual(style.sources, fixture.sources, 'retain attribution and tile sources')
  const water = style.layers[1]
  assert.ok(water.type === 'fill')
  assert.equal(water.paint?.['fill-color'], MAP_COLORS.ocean)
  const road = style.layers[2]
  assert.equal(road.minzoom, 9)
  for (const label of style.layers.filter((l) => l.type === 'symbol')) assert.equal(label.layout?.['icon-image'], undefined)
  assert.equal(style.layers.at(-1)?.minzoom, 10)
  assert.equal(fixture.layers.length, 15, 'does not modify its input')
})

test('Chinese labels fall back without duplicate bilingual lines or blank-name failures', () => {
  const expression = createExpression(PLACE_NAME, 'text-field')
  assert.equal(expression.result, 'success')
  if (expression.result !== 'success') return
  const name = (properties: Record<string, string>) => expression.value.evaluate({ zoom: 7 }, { type: 'Point', properties })
  assert.equal(name({ 'name:zh-Hant': '臺中', 'name:zh': '台中', name: 'Taichung' }), '臺中')
  assert.equal(name({ 'name:zh-Hant': '', 'name:nonlatin': '臺北', name: 'Taipei' }), '臺北')
  assert.equal(name({ name: 'Tokyo', 'name:en': 'Tokyo' }), 'Tokyo')
  assert.equal(name({ 'name:en': 'London' }), 'London')
  assert.equal(name({}), '')
})
