import assert from 'node:assert/strict'
import test from 'node:test'
import { minZooms } from './stations'

test('zoomed out keeps the most relevant of close stations, and zooming in only adds', () => {
  // Taipei, a station 2 km away, and Kaohsiung — most relevant first.
  const z = minZooms([[121.51, 25.04], [121.53, 25.05], [120.31, 22.57]])
  assert.equal(z[0], 5)
  assert.equal(z[2], 5, 'a far station is not hidden by a more relevant one')
  assert.ok(z[1] > 8 && z[1] <= 11, `a close neighbour waits until it fits: ${z[1]}`)
  assert.deepEqual(minZooms([[121.53, 25.05], [121.51, 25.04]]), [5, z[1]], 'order, not position, decides who stays')
})
