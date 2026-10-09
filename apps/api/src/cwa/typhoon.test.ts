import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeTyphoons } from './typhoon.js'

// Two active typhoons (NOLO 諾洛, KOGUMA 小熊), captured from W-C0034-005 on 2026-10-09.
const fx = JSON.parse(readFileSync(new URL('./fixtures/typhoons-2026-10-09.json', import.meta.url), 'utf8'))

test('typhoons: names, fixes in order, forecast times from the initial time plus the hour', () => {
  const [nolo, koguma] = normalizeTyphoons(fx)
  assert.deepEqual([nolo.name, nolo.cwaName, nolo.number, koguma.name, koguma.cwaName], ['NOLO', '諾洛', '27', 'KOGUMA', '小熊'])
  assert.equal(nolo.analysis.length, 18)
  assert.equal(nolo.forecast.length, 6)
  assert.deepEqual(nolo.analysis[0], { time: '2026-10-05T00:00:00.000Z', lon: 179.4, lat: 24.7, wind: 40, gust: 50, pressure: 955, speed: null, direction: null, r15: 200, r25: 70, r70: null })
  assert.equal(nolo.forecast[0].time, '2026-10-09T12:00:00.000Z') // 14:00+08:00 + 6 h
  assert.deepEqual([nolo.forecast[0].r15, nolo.forecast[0].r25, nolo.forecast[0].r70], [150, null, 30])
  assert.equal(koguma.forecast.at(-1)!.time, '2026-10-14T06:00:00.000Z') // +120 h
})

test('no cyclone is an empty list, and a broken document is an error', () => {
  assert.deepEqual(normalizeTyphoons({ records: {} }), [])
  assert.deepEqual(normalizeTyphoons({ records: { TropicalCyclones: { TropicalCyclone: [] } } }), [])
  assert.throws(() => normalizeTyphoons({ records: { TropicalCyclones: { TropicalCyclone: [{ AnalysisData: { Fix: [{ CoordinateLongitude: 'x', CoordinateLatitude: '1' }] } }] } } }))
})
