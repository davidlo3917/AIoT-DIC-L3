import type { FrameLayer } from './api'
import { RADAR_RAMP, RAMPS, type Ramp, type Variable } from './ramps'

export type LayerId = 'temperature' | 'rain' | 'radar' | 'humidity'

export type LayerDef = {
  label: string
  hint: string
  frames: FrameLayer // which timeline it runs on
  everyMin: 10 | 60 // how often CWA publishes a new frame
  loop: number // hours replayed when Play starts from the newest frame: enough to see the weather move, short enough to sit through
  kind: 'grid' | 'image' | 'stations-idw'
  stations: Variable // what the station dots (and the station card's chart) show while this layer is active
  landOnly: boolean // clipped to the coastline by the basemap's water
  legend: Ramp
}

export const LAYERS: Record<LayerId, LayerDef> = {
  temperature: { label: 'Temperature', hint: 'CWA hourly analysis', frames: 'temperature-grid', everyMin: 60, loop: 24, kind: 'grid', stations: 'temperature', landOnly: true, legend: RAMPS.temperature },
  rain: { label: 'Rain', hint: 'Radar estimate, past hour', frames: 'rain-grid', everyMin: 10, loop: 3, kind: 'grid', stations: 'rain', landOnly: false, legend: RAMPS.rain },
  radar: { label: 'Radar', hint: 'Composite reflectivity', frames: 'radar', everyMin: 10, loop: 3, kind: 'image', stations: 'rain', landOnly: false, legend: RADAR_RAMP },
  // CWA publishes no humidity grid, so this one follows the station clock and is interpolated in the browser.
  humidity: { label: 'Humidity', hint: 'Interpolated from stations', frames: 'stations', everyMin: 10, loop: 3, kind: 'stations-idw', stations: 'humidity', landOnly: true, legend: RAMPS.humidity },
}
