import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeForecast } from './forecast.js'

// 彰化縣 田中鎮, captured from F-D0047-019 (four elements) on 2026-10-09.
const fx = JSON.parse(readFileSync(new URL('./fixtures/forecast-tianzhong.json', import.meta.url), 'utf8'))

test('township forecast: periods in order, elements joined by time', () => {
  const periods = normalizeForecast(fx)!
  assert.equal(periods.length, 14)
  assert.deepEqual(periods[0], { start: '2026-10-09T04:00:00.000Z', end: '2026-10-09T10:00:00.000Z', weather: '晴時多雲', min: 28, max: 33, rainChance: 0 })
  assert.equal(periods[1].min, 23)
})

test('"-" is no number, and an unknown township is null rather than an error', () => {
  assert.equal(normalizeForecast(fx)!.at(-1)!.rainChance, null)
  assert.equal(normalizeForecast({ records: { Locations: [{ Location: [] }] } }), null)
  assert.throws(() => normalizeForecast({ unexpected: true }))
})
