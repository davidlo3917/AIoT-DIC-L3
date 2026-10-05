import assert from 'node:assert/strict'
import test from 'node:test'
import { en, I18N, translate, zh, type Key } from './i18n'

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()

test('both languages have every sentence, with the same placeholders', () => {
  for (const key of Object.keys(en) as Key[]) {
    assert.ok(zh[key]?.trim(), `${key} is empty in Chinese`)
    assert.equal(holes(zh[key]), holes(en[key]), `${key} takes different parameters in the two languages`)
  }
  assert.equal(en.compass.split(',').length, 8)
  assert.equal(zh.compass.split(',').length, 8)
})

test('placeholders are filled, and a forgotten one stays visible', () => {
  assert.equal(translate('en', 'timeline.past', { hours: 24, every: 'every hour' }), 'Past 24 h · every hour')
  assert.equal(translate('zh-Hant', 'timeline.past', { hours: 24, every: '每小時' }), '過去 24 小時 · 每小時更新')
  assert.equal(translate('en', 'station.label'), '{name} station')
})

test('times are Taiwan time, and midnight is 00:00 in both languages', () => {
  const midnight = new Date('2026-10-04T16:00:00Z'), afternoon = new Date('2026-10-05T05:50:00Z') // Monday 00:00 and 13:50 in Taipei
  assert.equal(I18N.en.weekdayTime.format(midnight), 'Mon 00:00')
  assert.equal(I18N.en.weekdayTime.format(afternoon), 'Mon 13:50')
  assert.equal(I18N['zh-Hant'].weekdayTime.format(midnight), '週一 00:00')
  for (const lang of ['en', 'zh-Hant'] as const) for (const f of [I18N[lang].time, I18N[lang].dayTime, I18N[lang].fullTime]) {
    assert.match(f.format(midnight), /00:00$/, `${lang}: ${f.format(midnight)}`)
  }
})

test('data age is minutes, then hours, and never in the future', () => {
  const now = Date.parse('2026-10-05T06:00:00Z'), { en: e, 'zh-Hant': z } = I18N
  assert.match(e.age(now - 12 * 60e3, now), /^12 min.* ago$/)
  assert.match(e.age(now - 89 * 60e3, now), /^89 min/)
  assert.match(e.age(now - 90 * 60e3, now), /^2 h/)
  assert.match(e.age(now - 3 * 3600e3, now), /^3 h.* ago$/)
  assert.equal(z.age(now - 12 * 60e3, now), '12 分鐘前')
  assert.equal(z.age(now - 3 * 3600e3, now), '3 小時前')
  assert.equal(e.age(now, now), 'just now')
  assert.equal(z.age(now + 5 * 60e3, now), '剛剛') // the viewer's clock is behind
})
