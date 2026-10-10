import assert from 'node:assert/strict'
import test from 'node:test'
import type { Station } from '../../api'
import { countyFeatures, countyTowns, forecastFrames } from './forecast'
import type { Counties } from './warnings'

test('seven daily frames start at today\'s midnight in Taiwan', () => {
  const frames = forecastFrames(Date.parse('2026-10-10T03:00:00Z')) // 11:00 Taipei
  assert.equal(frames.length, 7)
  assert.equal(frames[0].time, '2026-10-09T16:00:00.000Z')
  assert.equal(frames[6].time, '2026-10-15T16:00:00.000Z')
  assert.equal(forecastFrames(Date.parse('2026-10-09T17:00:00Z'))[0].time, '2026-10-09T16:00:00.000Z', '01:00 Taipei is already the 10th')
})

test('the lowest station\'s township stands for its county', () => {
  const s = (county: string, town: string | null, elevation: number | null): Station => ({ id: 0, cwaStationId: '', name: '', county, town, latitude: 0, longitude: 0, elevation })
  assert.deepEqual(countyTowns([s('嘉義縣', '阿里山鄉', 2413), s('嘉義縣', '東石鄉', 3), s('嘉義縣', null, 0), s('南投縣', '魚池鄉', null)]), { 嘉義縣: '東石鄉', 南投縣: '魚池鄉' })
})

test('a day is coloured by the average of its high and low; a county without that day keeps its name and no value', () => {
  const p = (start: string, end: string, min: number, max: number) => ({ start, end, weather: null, min, max, rainChance: null })
  const week = [p('2026-10-10T04:00:00Z', '2026-10-10T10:00:00Z', 24, 33), p('2026-10-10T10:00:00Z', '2026-10-10T22:00:00Z', 22, 28)] // Saturday day and night, Taipei
  const counties: Counties = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '臺中市' }, geometry: null }, { type: 'Feature', properties: { name: '金門縣' }, geometry: null }] }
  const noon = Date.parse('2026-10-10T04:00:00Z')
  const saturday = countyFeatures(counties, new Map([['臺中市', week]]), '2026-10-09T16:00:00.000Z', noon)
  assert.deepEqual(saturday.features.map((f) => f.properties), [{ name: '臺中市', max: 33, min: 22, avg: 27.5 }, { name: '金門縣' }])
  const evening = countyFeatures(counties, new Map([['臺中市', week]]), '2026-10-09T16:00:00.000Z', Date.parse('2026-10-10T11:00:00Z'))
  assert.deepEqual(evening.features[0].properties, { name: '臺中市', max: 28, min: 22, avg: 25 }, 'after 18:00 today is what is left of it, as the card shows it')
  assert.deepEqual(countyFeatures(counties, new Map([['臺中市', week]]), '2026-10-10T16:00:00.000Z', noon).features[0].properties, { name: '臺中市' }, 'Sunday has no periods')
})
