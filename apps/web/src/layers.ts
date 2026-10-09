import type { FrameLayer } from './api'
import { RADAR_RAMP, RAMPS, type Ramp, type Variable } from './ramps'

export type LayerId = 'temperature' | 'rain' | 'radar' | 'satellite' | 'humidity' | 'wind'

/** Names and one-line explanations live in the dictionary (i18n.ts) as `layer.<id>` and `layer.<id>.hint`. */
type LayerDef = {
  frames: FrameLayer // which timeline it runs on
  everyMin: 10 | 60 | 360 // how often CWA publishes a new frame
  loop: number // hours replayed when Play starts from the newest frame: enough to see the weather move, short enough to sit through
  stations: Variable // what the station dots (and the station card's chart) show while this layer is active
  landOnly: boolean // clipped to the coastline by the basemap's water
} & (
  | { kind: 'grid' | 'stations-idw' | 'wind'; legend: Ramp } // coloured here, so the ramp is the picture
  | { kind: 'image'; legend?: Ramp } // drawn as CWA published it; a legend only where the picture has a scale to read
)

export const LAYERS: Record<LayerId, LayerDef> = {
  temperature: { frames: 'temperature-grid', everyMin: 60, loop: 24, kind: 'grid', stations: 'temperature', landOnly: true, legend: RAMPS.temperature },
  rain: { frames: 'rain-grid', everyMin: 10, loop: 3, kind: 'grid', stations: 'rain', landOnly: false, legend: RAMPS.rain },
  radar: { frames: 'radar', everyMin: 10, loop: 3, kind: 'image', stations: 'rain', landOnly: false, legend: RADAR_RAMP },
  satellite: { frames: 'satellite', everyMin: 10, loop: 3, kind: 'image', stations: 'temperature', landOnly: false },
  // A model forecast, 6-hourly, reaching 3.5 days past now: its timeline opens at the present, and Play from the far
  // end replays the whole forecast from there.
  wind: { frames: 'wind', everyMin: 360, loop: 84, kind: 'wind', stations: 'wind', landOnly: false, legend: RAMPS.wind },
  // CWA publishes no humidity grid, so this one follows the station clock and is interpolated in the browser.
  humidity: { frames: 'stations', everyMin: 10, loop: 3, kind: 'stations-idw', stations: 'humidity', landOnly: true, legend: RAMPS.humidity },
}
