import assert from 'node:assert/strict'
import test from 'node:test'
import { dataAge, weekdayTime } from './format'

test('range ends carry the weekday, and midnight in Taipei is 00:00', () => {
  assert.equal(weekdayTime.format(new Date('2026-10-04T16:00:00Z')), 'Mon 00:00')
  assert.equal(weekdayTime.format(new Date('2026-10-05T05:50:00Z')), 'Mon 13:50')
})

test('data age is minutes, then hours, and never in the future', () => {
  const now = Date.parse('2026-10-05T06:00:00Z')
  assert.match(dataAge(now - 12 * 60e3, now), /^12 min.* ago$/)
  assert.match(dataAge(now - 89 * 60e3, now), /^89 min/)
  assert.match(dataAge(now - 90 * 60e3, now), /^2 h/)
  assert.match(dataAge(now - 3 * 3600e3, now), /^3 h.* ago$/)
  assert.equal(dataAge(now, now), 'just now')
  assert.equal(dataAge(now + 5 * 60e3, now), 'just now') // the viewer's clock is behind
})
