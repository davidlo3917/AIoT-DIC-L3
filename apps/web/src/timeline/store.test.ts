import assert from 'node:assert/strict'
import test from 'node:test'
import type { Frame } from '../api'
import { createTimelineStore, currentFrame, latestIndex } from './store'

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

test('seeking or stepping onto the newest frame resumes following', () => {
  const store = createTimelineStore(), a = store.actions
  load(store, frames(1, 2, 3)); a.seek(0)
  assert.equal(store.getSnapshot().followLatest, false)
  a.seek(2)
  assert.equal(store.getSnapshot().followLatest, true)
  a.step(-1)
  assert.equal(store.getSnapshot().followLatest, false)
  a.step(1); load(store, frames(1, 2, 3, 4))
  assert.equal(currentFrame(store.getSnapshot())?.time, frames(4)[0].time)
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

test('Play from the newest frame replays the layer\'s recent loop; from elsewhere it keeps its place', () => {
  const every10 = (n: number): Frame[] => Array.from({ length: n }, (_, i) => ({ time: new Date(Date.UTC(2026, 8, 22, 0, i * 10)).toISOString() }))
  const store = createTimelineStore(), a = store.actions
  a.setLayer('radar'); load(store, every10(145)); a.toggle() // 24 h of radar: loop is the last 3 h = 18 frames back
  assert.equal(store.getSnapshot().index, 126)
  a.toggle(); a.seek(50); a.toggle()
  assert.equal(store.getSnapshot().index, 50)
  a.setLayer('temperature'); load(store, frames(...Array.from({ length: 25 }, (_, h) => h))); a.latest(); a.toggle() // hourly: the whole day
  assert.equal(store.getSnapshot().index, 0)
  a.setLayer('rain'); load(store, frames(1, 2, 12)); a.latest(); a.toggle() // a gap: only the newest frame is inside the loop
  assert.equal(store.getSnapshot().index, 1, 'still one step back, so Play has something to play')
  assert.equal(store.getSnapshot().playing, true)
})

test('a forecast layer follows the last frame at or before now, never the future', () => {
  const now = Date.now(), forecast: Frame[] = [-30, -4, 2, 8, 14].map((h) => ({ time: new Date(now + h * 3600e3).toISOString() }))
  assert.equal(latestIndex(forecast, now), 1, 'the +2 h frame is nearer, but it is the future')
  assert.equal(latestIndex(forecast, now + 1.6 * 3600e3), 1, 'twenty-four minutes ahead is still the future: no readings for the dots yet')
  assert.equal(latestIndex(forecast, now + 2 * 3600e3), 2, 'on the minute it is now')
  assert.equal(latestIndex([], now), -1)
  assert.equal(latestIndex(forecast.slice(2), now), 0, 'all in the future: the earliest')
  const store = createTimelineStore(), a = store.actions
  a.setLayer('wind'); load(store, forecast)
  assert.equal(store.getSnapshot().index, 1)
  a.seek(4)
  assert.equal(store.getSnapshot().followLatest, false, 'the far end of the forecast is not "now"')
  a.seek(1)
  assert.equal(store.getSnapshot().followLatest, true)
  a.toggle() // from the present, Play goes forward through the forecast…
  assert.equal(store.getSnapshot().index, 1)
  a.tick(); a.tick(); a.tick(); a.tick() // …and off the end comes back to the present
  assert.equal(store.getSnapshot().index, 1)
  assert.equal(store.getSnapshot().followLatest, true)
})

test('stations are shown by default and hiding them clears selection', () => {
  const store = createTimelineStore()
  assert.equal(store.getSnapshot().showStations, true)
  store.actions.selectStation(42); store.actions.toggleStations()
  assert.equal(store.getSnapshot().selectedStation, null)
  assert.equal(store.getSnapshot().showStations, false)
})
