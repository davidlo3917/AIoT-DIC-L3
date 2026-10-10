import { useSyncExternalStore } from 'react'
import type { Cyclone, Frame, Warning } from '../api'
import { invalidateForecasts, invalidateObservations } from '../api'
import { LAYERS, type LayerId } from '../layers'

type LoadState = 'loading' | 'ready' | 'empty' | 'error'
type State = { layer: LayerId; showStations: boolean; frames: Frame[]; index: number; playing: boolean; speed: number;
  selectedStation: number | null; selectedCounty: string | null; followLatest: boolean; loadState: LoadState; refreshKey: number; cursorTime: string | null
  typhoons: Cyclone[]; typhoonFocus: { index: number; seq: number } | null // seq: the same name tapped twice flies there twice
  warnings: Warning[]; warningFocus: number | null } // the advisory opened in the panel: its counties are stressed on the map
export const currentFrame = (s: State): Frame | undefined => s.frames[s.index]

/**
 * The frame to follow: the last one at or before now. That is simply the last frame for a layer that only has the
 * past; the wind forecast's frames run on past now and are reached by stepping or playing forward, so "即時" never
 * shows the future — a frame even minutes ahead has no station readings yet, and the dots would vanish.
 */
export function latestIndex(frames: Frame[], now = Date.now()) {
  const i = frames.findLastIndex((f) => Date.parse(f.time) <= now)
  return i >= 0 || !frames.length ? i : 0
}

/** Independent instances make out-of-order requests and playback testable without a browser. */
export function createTimelineStore() {
  let state: State = { layer: 'temperature', showStations: true, frames: [], index: -1, playing: false, speed: 1,
    selectedStation: null, selectedCounty: null, followLatest: true, loadState: 'loading', refreshKey: 0, cursorTime: null, typhoons: [], typhoonFocus: null, warnings: [], warningFocus: null }
  let request = 0
  const listeners = new Set<() => void>()
  const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
  const actions = {
    setLayer(layer: LayerId) {
      if (layer === state.layer) return
      request++
      // The forecast layer opens on the capital's week: the card is what the layer is for, and a county is one tap away on the map.
      set({ layer, frames: [], index: -1, playing: false, loadState: 'loading', cursorTime: currentFrame(state)?.time ?? state.cursorTime,
        selectedCounty: layer === 'forecast' ? state.selectedCounty ?? '臺北市' : state.selectedCounty })
    },
    toggleStations() { set({ showStations: !state.showStations, selectedStation: null }) },
    selectStation(selectedStation: number | null) { set({ selectedStation }) },
    selectCounty(selectedCounty: string | null) { set({ selectedCounty }) },
    setTyphoons(typhoons: Cyclone[]) { set({ typhoons }) },
    setWarnings(warnings: Warning[]) { set({ warnings, warningFocus: state.warningFocus != null && state.warningFocus < warnings.length ? state.warningFocus : null }) },
    focusWarning(warningFocus: number | null) { set({ warningFocus }) },
    focusTyphoon(index: number) { set({ typhoonFocus: { index, seq: (state.typhoonFocus?.seq ?? 0) + 1 } }) },
    beginLoad(layer: LayerId) {
      const token = ++request
      if (layer === state.layer) set({ loadState: state.frames.length ? 'ready' : 'loading' })
      return token
    },
    setFrames(layer: LayerId, token: number, frames: Frame[]) {
      if (layer !== state.layer || token !== request) return
      const time = currentFrame(state)?.time ?? state.cursorTime
      let index = latestIndex(frames)
      if (!state.followLatest && time && frames.length) {
        index = frames.findLastIndex((f) => f.time <= time)
        if (index < 0) index = 0
      }
      set({ frames, index, cursorTime: frames[index]?.time ?? time, loadState: frames.length ? 'ready' : 'empty', playing: frames.length > 1 && state.playing })
    },
    failLoad(layer: LayerId, token: number) {
      // Frames already on screen stay, and so does playback: a failed background refresh is reported, not fatal.
      if (layer === state.layer && token === request) set({ loadState: 'error' })
    },
    retry() { request++; invalidateObservations(); invalidateForecasts(); set({ refreshKey: state.refreshKey + 1, loadState: 'loading' }) },
    seek(index: number) {
      const last = state.frames.length - 1
      index = Math.min(last, Math.max(0, index)) // -1 while there are no frames
      // Landing on the newest frame (slider dragged to the end, Next onto it) means "show me now": keep following.
      set({ playing: false, followLatest: index === latestIndex(state.frames), index, cursorTime: state.frames[index]?.time ?? null })
    },
    step(by: number) { actions.seek(state.index + by) },
    latest() {
      const index = latestIndex(state.frames)
      set({ followLatest: true, playing: false, index, cursorTime: state.frames[index]?.time ?? null })
    },
    setSpeed(speed: number) { set({ speed }) },
    toggle() {
      if (state.frames.length < 2) return
      let index = state.index
      if (!state.playing && index >= state.frames.length - 1) {
        // From the last frame, Play replays the layer's recent loop rather than the whole week (7 days of 10-minute
        // frames take 12 minutes). At least one step back, so there is always something to play. (A forecast layer's
        // last frame is days ahead; from the present it simply plays forward.)
        const from = Date.parse(state.frames[index].time) - LAYERS[state.layer].loop * 3600e3
        index = Math.min(state.frames.length - 2, state.frames.findIndex((f) => Date.parse(f.time) >= from))
      }
      set({ playing: !state.playing, followLatest: false, index })
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
