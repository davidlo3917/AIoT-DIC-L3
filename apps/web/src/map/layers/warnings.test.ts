import assert from 'node:assert/strict'
import test from 'node:test'
import type { Warning } from '../../api'
import { warningColor, warningFeatures, type Counties } from './warnings'

const county = (name: string) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon', coordinates: [] } })
const counties: Counties = { type: 'FeatureCollection', features: ['臺北市', '新北市', '宜蘭縣'].map(county) }
const warning = (phenomena: string, ...names: string[]): Warning => ({ phenomena, significance: '特報', start: '2026-10-09T02:36:00Z', end: '2026-10-10T15:00:00Z', counties: names, text: null })

test('a county under two advisories takes the colour of the more severe one; unknown names are not drawn', () => {
  const fc = warningFeatures(counties, [warning('陸上強風', '新北市', '宜蘭縣', '恆春半島'), warning('豪雨', '宜蘭縣')])
  assert.deepEqual(fc.features.map((f) => [f.properties.name, f.properties.phenomena]), [['新北市', '陸上強風'], ['宜蘭縣', '豪雨']])
  assert.equal(fc.features[1].properties.color, warningColor('豪雨'))
})

test('colours follow CWA severity, and an advisory nobody planned for still gets one', () => {
  assert.notEqual(warningColor('大豪雨'), warningColor('豪雨'))
  assert.equal(warningColor('陸上強風'), '#eab308')
  assert.match(warningColor('火山灰'), /^#/)
})
