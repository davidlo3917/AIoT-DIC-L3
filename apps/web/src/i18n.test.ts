import assert from 'node:assert/strict'
import test from 'node:test'
import { I18N, translate, zh } from './i18n'

test('placeholders are filled, and a forgotten one stays visible', () => {
  assert.equal(translate('timeline.past', { reach: translate('timeline.days', { days: 7 }), every: '每小時' }), '過去 7 天 · 每小時更新')
  assert.equal(translate('station.label'), '{name}測站')
  assert.equal(zh.compass.split(',').length, 8)
})

test('times are Taiwan time, and midnight is 00:00', () => {
  const midnight = new Date('2026-10-04T16:00:00Z') // Monday 00:00 in Taipei
  assert.equal(I18N.weekdayTime.format(midnight), '週一 00:00')
  for (const f of [I18N.time, I18N.dayTime, I18N.fullTime]) assert.match(f.format(midnight), /00:00$/, f.format(midnight))
})

test('data age is minutes, then hours, and never in the future', () => {
  const now = Date.parse('2026-10-05T06:00:00Z')
  assert.equal(I18N.age(now - 12 * 60e3, now), '12 分鐘前')
  assert.equal(I18N.age(now - 89 * 60e3, now), '89 分鐘前')
  assert.equal(I18N.age(now - 90 * 60e3, now), '2 小時前')
  assert.equal(I18N.age(now - 47 * 3600e3, now), '47 小時前')
  assert.equal(I18N.age(now - 71 * 3600e3, now), '3 天前')
  assert.equal(I18N.age(now, now), '剛剛')
  assert.equal(I18N.age(now + 5 * 60e3, now), '剛剛') // the viewer's clock is behind
})
