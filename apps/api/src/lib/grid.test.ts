import assert from 'node:assert/strict'
import test from 'node:test'
import { crc32, inflateSync } from 'node:zlib'
import { gridToPng, parseGrid, type GridEncoding } from './grid.js'
import { encodePng } from './png.js'

/** Independent PNG reader: checks signature + every chunk CRC, returns raw RGBA. */
function decodePng(png: Buffer) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let at = 8, width = 0, height = 0
  const idat: Buffer[] = []
  while (at < png.length) {
    const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8), data = png.subarray(at + 8, at + 8 + len)
    assert.equal(png.readUInt32BE(at + 8 + len), crc32(png.subarray(at + 4, at + 8 + len)), `bad CRC in ${type}`)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0]) }
    if (type === 'IDAT') idat.push(data)
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, rgba = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) { assert.equal(raw[y * (stride + 1)], 0); raw.copy(rgba, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1)) }
  return { width, height, rgba }
}

test('encodePng produces a valid PNG that round-trips', () => {
  const rgba = Uint8Array.from({ length: 3 * 2 * 4 }, (_, i) => (i * 37) % 256)
  const out = decodePng(encodePng(3, 2, rgba))
  assert.deepEqual([out.width, out.height], [3, 2])
  assert.deepEqual([...out.rgba], [...rgba])
  assert.throws(() => encodePng(3, 2, new Uint8Array(5)))
})

test('grid → PNG: north-up flip, rg16 packing, invalid cells transparent', () => {
  // 2 wide × 3 tall, CWA order: south row first. -999 = sea.
  const values = parseGrid('1.00E+00,-999.0E+00, 2.55E+01,3.0E+00, -3.4E+00,28.7E+00', 2, 3)
  const enc: GridEncoding = { encoding: 'rg16', offset: 50, scale: 100, unit: '°C', width: 2, height: 3 }
  const { rgba } = decodePng(gridToPng(values, enc, (v) => v > -90))
  const px = (x: number, y: number) => { const i = (y * 2 + x) * 4; return { v: Math.round((((rgba[i] << 8) | rgba[i + 1]) / enc.scale - enc.offset) * 100) / 100, a: rgba[i + 3] } } // round: float noise
  assert.deepEqual(px(0, 0), { v: -3.4, a: 255 }) // image top row = grid's LAST (northern) row
  assert.deepEqual(px(1, 0), { v: 28.7, a: 255 })
  assert.deepEqual(px(0, 1), { v: 25.5, a: 255 })
  assert.deepEqual(px(0, 2), { v: 1, a: 255 }) // image bottom row = grid's first (southern) row
  assert.equal(px(1, 2).a, 0) // sea
})

test('parseGrid: rows separated by a bare newline (as in O-A0038-003) still yield every value', () => {
  assert.deepEqual([...parseGrid('1.0E+00,2.0E+00\n3.0E+00,4.0E+00\n', 2, 2)], [1, 2, 3, 4])
})

test('parseGrid rejects a grid of the wrong size', () => {
  assert.throws(() => parseGrid('1,2,3', 2, 2), /expected 2×2/)
})
