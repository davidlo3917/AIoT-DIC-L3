import assert from 'node:assert/strict'
import test from 'node:test'
import { age, dayTime, fullTime, t, time, weekdayTime, zh } from './i18n'

test('placeholders are filled, and a forgotten one stays visible', () => {
  assert.equal(t('timeline.past', { reach: t('timeline.days', { days: 7 }), every: '每小時' }), '過去 7 天 · 每小時更新')
  assert.equal(t('station.label'), '{name}測站')
  assert.equal(zh.compass.split(',').length, 8)
})

test('times are Taiwan time, and midnight is 00:00', () => {
  const midnight = new Date('2026-10-04T16:00:00Z') // Monday 00:00 in Taipei
  assert.equal(weekdayTime.format(midnight), '週一 00:00')
  for (const f of [time, dayTime, fullTime]) assert.match(f.format(midnight), /00:00$/, f.format(midnight))
})

test('data age is minutes, then hours; a forecast frame is "later", a clock slightly behind is not', () => {
  const now = Date.parse('2026-10-05T06:00:00Z')
  assert.equal(age(now - 12 * 60e3, now), '12 分鐘前')
  assert.equal(age(now - 89 * 60e3, now), '89 分鐘前')
  assert.equal(age(now - 90 * 60e3, now), '2 小時前')
  assert.equal(age(now - 47 * 3600e3, now), '47 小時前')
  assert.equal(age(now - 71 * 3600e3, now), '3 天前')
  assert.equal(age(now, now), '剛剛')
  assert.equal(age(now + 5 * 60e3, now), '剛剛') // the viewer's clock is behind
  assert.equal(age(now + 6 * 3600e3, now), '6 小時後')
  assert.equal(age(now + 78 * 3600e3, now), '3 天後')
})
