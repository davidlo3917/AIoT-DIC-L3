// Run with: node --import tsx --test src/map/layers/idw.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { idw } from './idw'

const mask = { width: 4, height: 4, bounds: [120, 22, 121, 23] as [number, number, number, number], values: new Float32Array(16).fill(1) }
mask.values[0] = NaN // one sea cell

test('idw: exact at a station, bounded by inputs, respects the mask', () => {
  const pts = [{ lon: 120.125, lat: 22.125, value: 10 }, { lon: 120.875, lat: 22.875, value: 30 }, { lon: 120.875, lat: 22.125, value: 20 }]
  const out = idw(pts, mask)
  assert.ok(Number.isNaN(out.values[0]), 'sea stays empty')
  assert.equal(out.values[3 * 4 + 0], 10) // bottom-left cell centre is exactly the first station
  for (const v of out.values) if (!Number.isNaN(v)) assert.ok(v >= 10 && v <= 30)
  assert.ok(out.values[0 * 4 + 3] > out.values[3 * 4 + 0], 'nearer the 30 → higher')
})

test('idw: too few points → empty field, not a fabricated one', () => {
  assert.ok(idw([{ lon: 120.5, lat: 22.5, value: 50 }], mask).values.every(Number.isNaN))
})
