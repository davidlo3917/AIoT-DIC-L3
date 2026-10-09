import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import { lccProjector, parseHeader } from '../lib/grib.js'
import { CROP, encodeUv8, resample } from './wind.js'

const grid = parseHeader(readFileSync(new URL('../cwa/fixtures/wrf-ugrd10m-head.bin', import.meta.url))).grid

test('resample puts the Lambert grid north-up on the crop, interpolating between grid points', () => {
  // A field whose value at every grid point is its row index: bilinear sampling then returns the fractional row.
  const rows = Float32Array.from({ length: grid.nx * grid.ny }, (_, k) => Math.floor(k / grid.nx))
  const out = resample(rows, grid), project = lccProjector(grid)
  const at = (col: number, row: number) => out[row * CROP.width + col]
  const [, jExpected] = project(CROP.north - (0.5 / CROP.height) * (CROP.north - CROP.south), CROP.west + (0.5 / CROP.width) * (CROP.east - CROP.west))
  assert.ok(Math.abs(at(0, 0) - jExpected) < 1e-3, `${at(0, 0)} vs ${jExpected}`)
  assert.ok(at(0, 0) > at(0, CROP.height - 1), 'row 0 is north, where the grid row index is higher')
  assert.ok(out.every((v) => !Number.isNaN(v)), 'the crop lies inside the WRF domain')
  assert.ok(Number.isNaN(resample(rows, { ...grid, nx: 10, ny: 10 })[0]), 'outside a (tiny) grid is NaN')
})

test('uv8 packs u, v and speed into bytes and marks missing cells transparent', () => {
  const png = encodeUv8(Float32Array.from([10, NaN]), Float32Array.from([-3, 1]), 2, 1)
  assert.equal(png.readUInt32BE(16), 2) // IHDR width
  // The one IDAT chunk sits after the 8-byte signature and the 25-byte IHDR chunk: length, type, data, CRC.
  const len = png.readUInt32BE(33), raw = inflateSync(png.subarray(41, 41 + len))
  assert.deepEqual([...raw], [0, 148, 122, 42, 255, 0, 0, 0, 0]) // filter byte, then (10+64)×2, (−3+64)×2, round(10.44×4), 255; then a transparent cell
})
