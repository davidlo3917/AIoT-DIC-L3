import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeStation, num } from './stations.js'

// Real records captured from CWA on 2026-09-21 (see fixtures/stations.json).
const fx = JSON.parse(readFileSync(new URL('./fixtures/stations.json', import.meta.url), 'utf8'))
const byId = (group: 'weather' | 'rain', id: string) => normalizeStation(fx[group].find((s: any) => s.StationId === id))!

test('num: sentinels become null, real negatives survive', () => {
  assert.equal(num('-99'), null)
  assert.equal(num('-990.0'), null)
  assert.equal(num(''), null)
  assert.equal(num(undefined), null)
  assert.equal(num('abc'), null)
  assert.equal(num('-10.5'), -10.5) // Yushan in winter
  assert.equal(num('0.0'), 0) // zero rain is data, not missing
})

test('uses WGS84, not TWD67 (they differ by ~800 m)', () => {
  const { station } = byId('weather', 'C0TB40')
  assert.equal(station.latitude, 24.166144)
  assert.equal(station.longitude, 121.657414)
})

test('normal weather record: values parsed, missing gust is null, no rain fields', () => {
  const { station, observation: o } = byId('weather', 'C0TB40')
  assert.deepEqual([station.name, station.county, station.town, station.elevation], ['崇德', '花蓮縣', '秀林鄉', 8])
  assert.equal(o.observedAt.toISOString(), '2026-09-21T12:00:00.000Z') // 20:00 +08:00
  assert.deepEqual([o.temperature, o.humidity, o.pressure, o.windSpeed, o.windDirection], [27.6, 68, 1010.8, 3, 49])
  assert.equal(o.gustSpeed, null)
  assert.deepEqual([o.rain1h, o.rain24h], [null, null])
})

test('station outage: every reading null, station itself still usable', () => {
  const { station, observation: o } = byId('weather', 'C0TC00')
  assert.ok(station.latitude > 21 && station.latitude < 27)
  const { observedAt, ...readings } = o
  assert.ok(Object.values(readings).every((v) => v === null), JSON.stringify(readings))
})

test('fully populated manned station keeps gust', () => {
  assert.equal(byId('weather', '466940').observation.gustSpeed, 5.1)
})

test('rain gauge record: rain fields only', () => {
  const o = byId('rain', '467650').observation
  assert.deepEqual([o.rain1h, o.rain24h], [0, 9.5])
  assert.equal(o.temperature, null)
})

test('malformed records are skipped, not thrown', () => {
  assert.equal(normalizeStation({}), null)
  assert.equal(normalizeStation(null), null)
  const noWgs = structuredClone(fx.weather[0]); noWgs.GeoInfo.Coordinates = noWgs.GeoInfo.Coordinates.filter((c: any) => c.CoordinateName !== 'WGS84')
  assert.equal(normalizeStation(noWgs), null)
})
