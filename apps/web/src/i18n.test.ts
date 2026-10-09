import assert from 'node:assert/strict'
import test from 'node:test'
import { I18N, translate, zh } from './i18n'

test('placeholders are filled, and a forgotten one stays visible', () => {
  assert.equal(translate('timeline.past', { hours: 24, every: '每小時' }), '過去 24 小時 · 每小時更新')
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
  assert.equal(I18N.age(now, now), '剛剛')
  assert.equal(I18N.age(now + 5 * 60e3, now), '剛剛') // the viewer's clock is behind
})

test('forecast periods are named by Taiwan day and part of day', () => {
  const noon = Date.parse('2026-10-09T04:00:00Z') // Friday 12:00 in Taipei
  assert.equal(I18N.period(noon, noon), '今天白天')
  assert.equal(I18N.period(Date.parse('2026-10-09T10:00:00Z'), noon), '今天晚上') // 18:00
  assert.equal(I18N.period(Date.parse('2026-10-09T22:00:00Z'), noon), '明天白天') // Saturday 06:00
  assert.equal(I18N.period(Date.parse('2026-10-10T16:00:00Z'), noon), '週日凌晨') // Sunday 00:00
  assert.equal(I18N.period(Date.parse('2026-10-09T16:30:00Z'), Date.parse('2026-10-09T15:59:00Z')), '明天凌晨') // across midnight
})
