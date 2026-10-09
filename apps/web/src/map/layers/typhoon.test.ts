import assert from 'node:assert/strict'
import test from 'node:test'
import type { Cyclone, Fix } from '../../api'
import { shortDayTime } from '../../i18n'
import { cycloneBounds, ring, typhoonFeatures } from './typhoon'

const fix = (lon: number, lat: number, time: string, extra: Partial<Fix> = {}): Fix =>
  ({ time, lon, lat, wind: null, pressure: null, r15: null, r25: null, r70: null, ...extra })
const koguma: Cyclone = { name: 'KOGUMA', cwaName: '小熊',
  analysis: [fix(156, 19, '2026-10-09T00:00:00Z'), fix(155.3, 19.3, '2026-10-09T06:00:00Z', { r15: 180, r25: 70 })],
  forecast: [fix(153.9, 19.9, '2026-10-09T12:00:00Z', { r70: 40 }), fix(152, 21, '2026-10-09T18:00:00Z', { r70: 70 })] }

test('a ring closes on itself and spans the radius in both directions', () => {
  const r = ring([120, 23], 111.32, 8)
  assert.equal(r.length, 9)
  assert.deepEqual(r[0], r[8])
  assert.ok(Math.abs(r[2][1] - 24) < 1e-9) // north: one degree of latitude
  assert.ok(Math.abs(r[0][0] - 120 - 1 / Math.cos((23 * Math.PI) / 180)) < 1e-9) // east: wider, in degrees, this far from the equator
})

test('features: both tracks, the positions, wind radii now and the probability circles ahead', () => {
  const kinds = typhoonFeatures([koguma]).features.map((f) => `${f.properties.kind}:${f.geometry.type}`)
  assert.deepEqual(kinds, ['track:LineString', 'forecast:LineString', 'r70:Polygon', 'r70:Polygon', 'r15:Polygon', 'r25:Polygon', 'now:Point', 'past:Point', 'fc:Point', 'fc:Point'])
  const labels = typhoonFeatures([koguma]).features.filter((f) => f.properties.label).map((f) => f.properties.label)
  const at = (iso: string) => shortDayTime.format(new Date(iso)) // Intl's own separator, whatever it is in this runtime
  assert.deepEqual(labels, ['小熊', at('2026-10-09T12:00:00Z'), at('2026-10-09T18:00:00Z')])
  assert.equal(typhoonFeatures([]).features.length, 0)
})

test('bounds cover every fix and its circle, and nothing is nothing', () => {
  const [w, s, e, n] = cycloneBounds(koguma)!
  assert.ok(w < 152 && e > 156 && s < 19 && n > 21)
  assert.equal(cycloneBounds({ ...koguma, analysis: [], forecast: [] }), null)
})
