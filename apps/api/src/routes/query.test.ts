import assert from 'node:assert/strict'
import test from 'node:test'
import { atQuery, layerQuery, MAX_RANGE_DAYS, rangeQuery, stationIdParam } from './query.js'

test('range defaults to the last 24 hours', () => {
  const { from, to } = rangeQuery.parse({})
  assert.equal(to.getTime() - from.getTime(), 24 * 3600e3)
  assert.ok(Math.abs(to.getTime() - Date.now()) < 5000)
})

test('range accepts Taiwan-offset timestamps and converts to the same instant', () => {
  const { from, to } = rangeQuery.parse({ from: '2026-09-21T20:00:00+08:00', to: '2026-09-21T13:00:00Z' })
  assert.equal(from.toISOString(), '2026-09-21T12:00:00.000Z')
  assert.equal(to.toISOString(), '2026-09-21T13:00:00.000Z')
})

test('range rejects inverted, oversized, and non-ISO input', () => {
  assert.equal(rangeQuery.safeParse({ from: '2026-09-21T13:00:00Z', to: '2026-09-21T12:00:00Z' }).success, false)
  const to = new Date(), from = new Date(to.getTime() - (MAX_RANGE_DAYS + 1) * 86400e3)
  assert.equal(rangeQuery.safeParse({ from: from.toISOString(), to: to.toISOString() }).success, false)
  assert.equal(rangeQuery.safeParse({ from: 'yesterday' }).success, false)
  assert.equal(rangeQuery.safeParse({ from: '2026-09-21 12:00' }).success, false) // no offset = ambiguous
})

test('at defaults to now; layer is a closed set', () => {
  assert.ok(Math.abs(atQuery.parse({}).at.getTime() - Date.now()) < 5000)
  assert.equal(layerQuery.safeParse({ layer: 'radar' }).success, true)
  assert.equal(layerQuery.safeParse({ layer: 'radar; drop table' }).success, false)
  assert.equal(layerQuery.safeParse({}).success, false)
})

test('station id shape', () => {
  for (const ok of ['466940', 'C0TB40', 'C1I230']) assert.equal(stationIdParam.safeParse(ok).success, true)
  for (const bad of ['', '1', "46' or 1=1", '../etc', 'x'.repeat(40)]) assert.equal(stationIdParam.safeParse(bad).success, false)
})
