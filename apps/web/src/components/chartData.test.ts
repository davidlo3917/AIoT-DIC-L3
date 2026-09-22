import assert from 'node:assert/strict'
import test from 'node:test'
import { chartExtent } from './chartData'

test('constant weather readings keep actual extrema while the plotting axis gets padding', () => {
  assert.deepEqual(chartExtent([{ v: 25 }, { v: 25 }]), { min: 25, max: 25, low: 24, high: 26 })
  assert.deepEqual(chartExtent([{ v: 0 }, { v: 0 }], true), { min: 0, max: 0, low: 0, high: 1 })
})

test('rain bars start at zero without reporting zero as the measured minimum', () => {
  assert.deepEqual(chartExtent([{ v: 5 }, { v: 20 }], true), { min: 5, max: 20, low: 0, high: 20 })
})
