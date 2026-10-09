import assert from 'node:assert/strict'
import test from 'node:test'
import type { Frame } from '../../api'
import type { WindField } from './grid'
import { blend, hourly, speedAt } from './wind'

const at = (h: number): Frame => ({ time: new Date(Date.UTC(2026, 9, 9, h)).toISOString(), url: `${h}.png`, bounds: [115, 19, 127, 29] })

test('hourly fills the gaps between 6-hourly frames and leaves hourly ones alone', () => {
  const frames = hourly([at(0), at(6), at(12)])
  assert.deepEqual(frames.map((f) => f.time.slice(11, 13)), ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
  assert.deepEqual(frames[4].between, [at(0), at(6), 4 / 6])
  assert.equal(frames[6].between, undefined)
  assert.equal(hourly([at(0), at(1)]).length, 2)
  assert.deepEqual(hourly([]), [])
})

test('speedAt reads the cell under a point and NaN beyond the field', () => {
  const f: WindField = { width: 2, height: 1, bounds: [0, 0, 2, 1], u: new Float32Array(2), v: new Float32Array(2), values: Float32Array.from([3, 7]) }
  assert.equal(speedAt(f, 0.5, 0.5), 3)
  assert.equal(speedAt(f, 1.99, 0.01), 7)
  assert.ok(Number.isNaN(speedAt(f, 2.5, 0.5)))
  assert.ok(Number.isNaN(speedAt(f, 0.5, -0.1)))
})

test('blend mixes u and v, takes the speed of the mix, and keeps holes', () => {
  const field = (u: number[], v: number[]): WindField => ({ width: 2, height: 1, bounds: [0, 0, 1, 1], u: Float32Array.from(u), v: Float32Array.from(v), values: Float32Array.from(u.map((x, i) => Math.hypot(x, v[i]))) })
  const m = blend(field([0, 4], [10, NaN]), field([10, 8], [0, 2]), 0.5)
  assert.deepEqual([...m.u], [5, 6])
  assert.deepEqual([...m.v], [5, NaN])
  assert.ok(Math.abs(m.values[0] - Math.hypot(5, 5)) < 1e-6)
  assert.ok(Number.isNaN(m.values[1]))
})
