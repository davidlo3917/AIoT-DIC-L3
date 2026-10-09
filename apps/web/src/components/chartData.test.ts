import assert from 'node:assert/strict'
import test from 'node:test'
import { chartExtent, weatherIcon } from './chartData'

test('constant weather readings keep actual extrema while the plotting axis gets padding', () => {
  assert.deepEqual(chartExtent([{ v: 25 }, { v: 25 }]), { min: 25, max: 25, low: 24, high: 26 })
  assert.deepEqual(chartExtent([{ v: 0 }, { v: 0 }], true), { min: 0, max: 0, low: 0, high: 1 })
})

test('rain bars start at zero without reporting zero as the measured minimum', () => {
  assert.deepEqual(chartExtent([{ v: 5 }, { v: 20 }], true), { min: 5, max: 20, low: 0, high: 20 })
})

test('weather icons follow the wording, by day and by night', () => {
  const day = '2026-10-09T04:00:00Z', night = '2026-10-09T10:00:00Z' // 12:00 and 18:00 in Taipei
  assert.equal(weatherIcon('晴時多雲', day), '🌤️')
  assert.equal(weatherIcon('晴時多雲', night), '🌙')
  assert.equal(weatherIcon('多雲時晴', day), '⛅')
  assert.equal(weatherIcon('陰時多雲', day), '☁️')
  assert.equal(weatherIcon('多雲短暫陣雨', day), '🌧️')
  assert.equal(weatherIcon('晴午後短暫陣雨', day), '🌦️')
  assert.equal(weatherIcon('多雲午後短暫陣雨或雷雨', day), '⛈️')
  assert.equal(weatherIcon('陰有霧', night), '🌫️')
})
