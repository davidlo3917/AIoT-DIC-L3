import assert from 'node:assert/strict'
import test from 'node:test'
import type { Frame } from '../api'
import { createTimelineStore, currentFrame } from './store'

const frames = (...hours: number[]): Frame[] => hours.map((h) => ({ time: new Date(Date.UTC(2026, 8, 22, h)).toISOString() }))
const load = (store: ReturnType<typeof createTimelineStore>, data: Frame[]) => {
  const layer = store.getSnapshot().layer
  store.actions.setFrames(layer, store.actions.beginLoad(layer), data)
}

test('latest polling advances; scrubbing holds history; Latest resumes following', () => {
  const store = createTimelineStore(), a = store.actions
  load(store, frames(1, 2)); load(store, frames(1, 2, 3))
  assert.equal(currentFrame(store.getSnapshot())?.time, frames(3)[0].time)
  a.seek(0); load(store, frames(1, 2, 3, 4))
  assert.equal(currentFrame(store.getSnapshot())?.time, frames(1)[0].time)
  assert.equal(store.getSnapshot().followLatest, false)
  a.latest(); load(store, frames(1, 2, 3, 4, 5))
  assert.equal(currentFrame(store.getSnapshot())?.time, frames(5)[0].time)
})

test('late responses cannot replace a new layer, even after switching back', () => {
  const store = createTimelineStore(), a = store.actions
  const old = a.beginLoad('temperature')
  a.setLayer('rain'); a.setFrames('temperature', old, frames(1))
  assert.equal(store.getSnapshot().frames.length, 0)
  a.setLayer('temperature'); load(store, frames(4))
  a.setFrames('temperature', old, frames(1)); a.failLoad('temperature', old)
  assert.equal(currentFrame(store.getSnapshot())?.time, frames(4)[0].time)
  assert.equal(store.getSnapshot().loadState, 'ready')
})

test('empty and failed loads recover, and old requests cannot win a retry', () => {
  const store = createTimelineStore(), a = store.actions
  load(store, [])
  assert.equal(store.getSnapshot().loadState, 'empty')
  a.toggle(); a.seek(0)
  assert.equal(store.getSnapshot().index, -1)
  assert.equal(store.getSnapshot().playing, false)
  const old = a.beginLoad('temperature')
  a.failLoad('temperature', old)
  assert.equal(store.getSnapshot().loadState, 'error')
  a.retry(); a.setFrames('temperature', old, frames(1))
  assert.equal(store.getSnapshot().loadState, 'loading')
  load(store, frames(2))
  assert.equal(store.getSnapshot().loadState, 'ready')
})

test('layer switch preserves historical time at or before the selected instant', () => {
  const store = createTimelineStore()
  load(store, frames(1, 2, 3)); store.actions.seek(1)
  store.actions.setLayer('rain'); load(store, frames(1, 3))
  assert.equal(currentFrame(store.getSnapshot())?.time, frames(1)[0].time)
  store.actions.setLayer('rain')
  assert.equal(store.getSnapshot().frames.length, 2, 'reselecting the layer must not clear it')
})

test('playback starts at the beginning and resumes latest-following after completion', () => {
  const store = createTimelineStore(), a = store.actions
  load(store, frames(1, 2)); a.toggle()
  assert.equal(store.getSnapshot().index, 0)
  assert.equal(store.getSnapshot().followLatest, false)
  a.tick(); a.tick()
  assert.equal(store.getSnapshot().playing, false)
  assert.equal(store.getSnapshot().followLatest, true)
})

test('stations are opt-in and hiding them clears selection', () => {
  const store = createTimelineStore()
  assert.equal(store.getSnapshot().showStations, false)
  store.actions.toggleStations(); store.actions.selectStation(42); store.actions.toggleStations()
  assert.equal(store.getSnapshot().selectedStation, null)
  assert.equal(store.getSnapshot().showStations, false)
})
