import { useSyncExternalStore } from 'react'
import type { Frame } from '../api'
import { invalidateObservations } from '../api'
import type { LayerId } from '../layers'

export type LoadState = 'loading' | 'ready' | 'empty' | 'error'
type State = { layer: LayerId; showStations: boolean; frames: Frame[]; index: number; playing: boolean; speed: number;
  selectedStation: number | null; followLatest: boolean; loadState: LoadState; refreshKey: number; cursorTime: string | null }
export const currentFrame = (s: State): Frame | undefined => s.frames[s.index]

/** Independent instances make out-of-order requests and playback testable without a browser. */
export function createTimelineStore() {
  let state: State = { layer: 'temperature', showStations: false, frames: [], index: -1, playing: false, speed: 1,
    selectedStation: null, followLatest: true, loadState: 'loading', refreshKey: 0, cursorTime: null }
  let request = 0
  const listeners = new Set<() => void>()
  const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
  const actions = {
    setLayer(layer: LayerId) {
      if (layer === state.layer) return
      request++
      set({ layer, frames: [], index: -1, playing: false, loadState: 'loading', cursorTime: currentFrame(state)?.time ?? state.cursorTime })
    },
    toggleStations() { set({ showStations: !state.showStations, selectedStation: null }) },
    selectStation(selectedStation: number | null) { set({ selectedStation }) },
    beginLoad(layer: LayerId) {
      const token = ++request
      if (layer === state.layer) set({ loadState: state.frames.length ? 'ready' : 'loading' })
      return token
    },
    setFrames(layer: LayerId, token: number, frames: Frame[]) {
      if (layer !== state.layer || token !== request) return
      const time = currentFrame(state)?.time ?? state.cursorTime
      let index = frames.length - 1
      if (!state.followLatest && time && frames.length) {
        index = frames.findLastIndex((f) => f.time <= time)
        if (index < 0) index = 0
      }
      set({ frames, index, cursorTime: frames[index]?.time ?? time, loadState: frames.length ? 'ready' : 'empty', playing: frames.length > 1 && state.playing })
    },
    failLoad(layer: LayerId, token: number) {
      if (layer === state.layer && token === request) set({ loadState: 'error', playing: false })
    },
    retry() { request++; invalidateObservations(); set({ refreshKey: state.refreshKey + 1, loadState: 'loading' }) },
    seek(index: number) {
      index = state.frames.length ? Math.max(0, Math.min(state.frames.length - 1, index)) : -1
      set({ playing: false, followLatest: false, index, cursorTime: state.frames[index]?.time ?? null })
    },
    step(by: number) { actions.seek(state.index + by) },
    latest() { set({ followLatest: true, playing: false, index: state.frames.length - 1, cursorTime: state.frames.at(-1)?.time ?? null }) },
    setSpeed(speed: number) { set({ speed }) },
    toggle() {
      if (state.frames.length < 2) return
      set({ playing: !state.playing, followLatest: false, index: !state.playing && state.index >= state.frames.length - 1 ? 0 : state.index })
    },
    tick() {
      if (!state.frames.length) return
      if (state.index >= state.frames.length - 1) actions.latest()
      else set({ index: state.index + 1, cursorTime: state.frames[state.index + 1].time })
    },
  }
  return { actions, getSnapshot: () => state, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } } }
}

const store = createTimelineStore()
export const actions = store.actions
export const useStore = <T,>(select: (s: State) => T) => useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))
