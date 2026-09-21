import { useSyncExternalStore } from 'react'
import type { Frame } from '../api'
import type { Variable } from '../ramps'

// One timeline for every layer (DESIGN §12): a layer supplies frames, the store owns the clock.
type State = { variable: Variable; showStations: boolean; frames: Frame[]; index: number; playing: boolean; speed: number; selectedStation: number | null }

let state: State = { variable: 'temperature', showStations: true, frames: [], index: -1, playing: false, speed: 1, selectedStation: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }

export const useStore = <T,>(select: (s: State) => T) => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => select(state))
export const currentFrame = (s: State): Frame | undefined => s.frames[s.index]

export const actions = {
  setVariable: (variable: Variable) => set({ variable, frames: [], index: -1, playing: false }),
  toggleStations: () => set({ showStations: !state.showStations }),
  selectStation: (selectedStation: number | null) => set({ selectedStation }),
  /** New frames keep the clock where it was if that instant still exists, otherwise jump to the newest. */
  setFrames: (frames: Frame[]) => {
    const at = currentFrame(state)?.time
    const kept = at ? frames.findIndex((f) => f.time === at) : -1
    set({ frames, index: kept >= 0 ? kept : frames.length - 1 })
  },
  /** Manual navigation (scrub, step) takes the clock away from playback, like every video player. */
  seek: (index: number) => set({ playing: false, index: Math.max(0, Math.min(state.frames.length - 1, index)) }),
  step: (by: number) => actions.seek(state.index + by),
  setSpeed: (speed: number) => set({ speed }),
  toggle: () => set({ playing: !state.playing, index: !state.playing && state.index >= state.frames.length - 1 ? 0 : state.index }),
  /** Called by the playback timer; stops at the newest frame instead of looping past "now". */
  tick: () => (state.index >= state.frames.length - 1 ? set({ playing: false }) : set({ index: state.index + 1 })),
}
