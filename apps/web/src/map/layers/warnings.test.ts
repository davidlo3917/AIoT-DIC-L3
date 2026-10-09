import assert from 'node:assert/strict'
import test from 'node:test'
import type { Warning } from '../../api'
import { countyBounds, warningColor, warningFeatures, type Counties } from './warnings'

const box = (x: number, y: number) => [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]]
const county = (name: string, i: number) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon', coordinates: box(120 + i, 22 + i) } })
const counties: Counties = { type: 'FeatureCollection', features: ['臺北市', '新北市', '宜蘭縣'].map(county) }
const warning = (phenomena: string, ...names: string[]): Warning => ({ phenomena, significance: '特報', start: '2026-10-09T02:36:00Z', end: '2026-10-10T15:00:00Z', counties: names, text: null })

test('a county under two advisories takes the colour of the more severe one; unknown names are not drawn', () => {
  const fc = warningFeatures(counties, [warning('陸上強風', '新北市', '宜蘭縣', '恆春半島'), warning('豪雨', '宜蘭縣')])
  assert.deepEqual(fc.features.map((f) => [f.properties.name, f.properties.phenomena]), [['新北市', '陸上強風'], ['宜蘭縣', '豪雨']])
  assert.equal(fc.features[1].properties.color, warningColor('豪雨'))
})

test('the opened advisory marks its counties, and its bounds cover exactly them', () => {
  const warnings = [warning('陸上強風', '新北市'), warning('豪雨', '宜蘭縣', '臺北市')]
  assert.deepEqual(warningFeatures(counties, warnings, 1).features.map((f) => [f.properties.name, f.properties.focused]), [['臺北市', true], ['新北市', false], ['宜蘭縣', true]])
  assert.deepEqual(warningFeatures(counties, warnings).features.map((f) => f.properties.focused), [false, false, false])
  assert.deepEqual(countyBounds(counties, warnings[1].counties), [120, 22, 123, 25])
  assert.equal(countyBounds(counties, ['恆春半島']), null)
})

test('colours follow CWA severity, and an advisory nobody planned for still gets one', () => {
  assert.notEqual(warningColor('大豪雨'), warningColor('豪雨'))
  assert.equal(warningColor('陸上強風'), '#eab308')
  assert.match(warningColor('火山灰'), /^#/)
})
