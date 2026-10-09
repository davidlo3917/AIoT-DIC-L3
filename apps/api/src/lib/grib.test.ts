import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { lccProjector, parseHeader, unpackSimple } from './grib.js'

// The first 4 KB of the 10 m U-wind message (the 67th) of CWA's M-A0064-006.grb2, run 2026-10-09 00Z.
const head = readFileSync(new URL('../cwa/fixtures/wrf-ugrd10m-head.bin', import.meta.url))

test('parses the WRF header: 10 m U wind, run and lead time, Lambert grid, 24-bit simple packing', () => {
  const h = parseHeader(head)
  assert.equal(h.length, 2338190)
  assert.equal(h.refTime.toISOString(), '2026-10-09T00:00:00.000Z')
  assert.deepEqual([h.discipline, h.category, h.parameter], [0, 2, 2])
  assert.equal(h.forecastHours, 6)
  assert.deepEqual([h.levelType, h.level], [103, 10])
  assert.deepEqual(h.grid, { nx: 1158, ny: 673, lat1: 14.02224, lon1: 105.25, lov: 120, latin1: 10, latin2: 40, dx: 3000, dy: 3000, radius: 6_370_000 })
  assert.deepEqual(h.packing, { template: 0, R: -1572721.125, E: 0, D: 5, bits: 24, points: 1158 * 673 })
  assert.deepEqual(h.data, { offset: 184, length: 2338002 }) // 779,334 points × 3 bytes
})

test('refuses what it cannot read: other files, a bitmap, a truncated header', () => {
  assert.throws(() => parseHeader(Buffer.from('not a grib file at all, just text')), /not a GRIB2/)
  const bitmapped = Buffer.from(head)
  bitmapped[173 + 5] = 0 // section 6: bitmap indicator
  assert.throws(() => parseHeader(bitmapped), /bitmap/)
  assert.throws(() => parseHeader(head.subarray(0, 100)), /runs past/)
})

test('unpacks 24-bit simple packing: value = (R + X) / 10^D', () => {
  const packing = { template: 0, R: -1572721.125, E: 0, D: 5, bits: 24, points: 3 }
  const payload = Buffer.from([0x18, 0x00, 0x00, 0x00, 0x00, 0x01, 0xff, 0xff, 0xff]) // X = 1572864, 1, 16777215
  const [a, b, c] = unpackSimple(payload, packing)
  assert.ok(Math.abs(a - 0.00142875) < 1e-9, String(a))
  assert.ok(Math.abs(b - -15.72720125) < 1e-4, String(b)) // Float32Array: ~7 significant digits
  assert.ok(Math.abs(c - 152.04493875) < 1e-4, String(c))
  assert.throws(() => unpackSimple(payload.subarray(0, 8), packing), /fewer than/)
  assert.throws(() => unpackSimple(payload, { ...packing, template: 3 }), /simple packing/)
  // Odd widths straddle bytes: 12-bit values 0xabc, 0xdef.
  const twelve = unpackSimple(Buffer.from([0xab, 0xcd, 0xef]), { template: 0, R: 0, E: 0, D: 0, bits: 12, points: 2 })
  assert.deepEqual([...twelve], [0xabc, 0xdef])
})

test("the Lambert projector maps CWA's stated grid corners onto the first and last grid points", () => {
  const project = lccProjector(parseHeader(head).grid)
  const [i0, j0] = project(14.02224, 105.25)
  assert.ok(Math.abs(i0) < 1e-6 && Math.abs(j0) < 1e-6, `${i0},${j0}`)
  const [i1, j1] = project(32.1202, 140.9138) // CWA's documented end point, to its 4 decimals
  assert.ok(Math.abs(i1 - 1157) < 0.01 && Math.abs(j1 - 672) < 0.01, `${i1},${j1}`)
  const [i, j] = project(23.7, 120.97) // the middle of Taiwan sits inside the grid, east of the central meridian
  assert.ok(i > 500 && i < 700 && j > 300 && j < 400, `${i},${j}`)
})
