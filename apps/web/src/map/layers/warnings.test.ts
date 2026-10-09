import assert from 'node:assert/strict'
import test from 'node:test'
import type { Warning } from '../../api'
import { countyBounds, warningColor, warningFeatures, type Counties } from './warnings'

const box = (x: number, y: number) => [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]]
const county = (name: string, i: number) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon', coordinates: box(120 + i, 22 + i) } })
const counties: Counties = { type: 'FeatureCollection', features: ['臺北市', '新北市', '宜蘭縣'].map(county) }
const warning = (phenomena: string, ...names: string[]): Warning => ({ phenomena, significance: '特報', start: '2026-10-09T02:36:00Z', end: '2026-10-10T15:00:00Z', counties: names, text: null })

test('only the opened advisory is drawn: its counties, nothing while none is open, unknown names skipped', () => {
  const warnings = [warning('陸上強風', '新北市', '恆春半島'), warning('豪雨', '宜蘭縣', '臺北市')]
  assert.deepEqual(warningFeatures(counties, warnings, 1).features.map((f) => f.properties.name), ['臺北市', '宜蘭縣'])
  assert.deepEqual(warningFeatures(counties, warnings, 0).features.map((f) => f.properties.name), ['新北市'])
  assert.equal(warningFeatures(counties, warnings, null).features.length, 0)
  assert.deepEqual(countyBounds(counties, warnings[1].counties), [120, 22, 123, 25])
  assert.equal(countyBounds(counties, ['恆春半島']), null)
})

test('panel dot colours follow CWA severity, and an advisory nobody planned for still gets one', () => {
  assert.notEqual(warningColor('大豪雨'), warningColor('豪雨'))
  assert.equal(warningColor('陸上強風'), '#eab308')
  assert.match(warningColor('火山灰'), /^#/)
})
