import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { getFrames, getObservations, type Frame, type FrameLayer, type Observation, type Station } from '../api'
import { RAMPS, type Variable } from '../ramps'
import { actions, currentFrame, useStore } from '../timeline/store'
import { loadField, paint, type Field } from './layers/grid'
import { idw } from './layers/idw'
import { addStationLayers, updateStations } from './layers/stations'

const SURFACE = 'surface', COAST = 'surface-coast'
// Land-only fields are clipped by a copy of the basemap's water drawn over them; rain covers the sea and is not.
const LAND_ONLY: Record<Variable, boolean> = { temperature: true, humidity: true, rain: false }
// Which timeline a variable runs on. Humidity has no CWA grid, so it follows the station clock and is interpolated here.
const FRAME_LAYER: Record<Variable, FrameLayer> = { temperature: 'temperature-grid', rain: 'rain-grid', humidity: 'stations' }
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const corners = ([w, s, e, n]: Field['bounds']) => [[w, n], [e, n], [e, s], [w, s]] as [[number, number], [number, number], [number, number], [number, number]]

/** Wires the store to the map: frames for the active variable, the coloured surface, and the station dots. */
export function useWeather(map: MapLibreMap | null, stations: Station[]) {
  const variable = useStore((s) => s.variable)
  const showStations = useStore((s) => s.showStations)
  const frame = useStore(currentFrame)
  const [status, setStatus] = useState<string | null>(null)
  const canvas = useRef(document.createElement('canvas'))
  const landMask = useRef<Promise<Field | null> | null>(null)

  useEffect(() => {
    if (!map) return
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id // keep place names above the surface
    map.addSource(SURFACE, { type: 'image', url: BLANK, coordinates: corners([119, 21, 123, 26]) })
    map.addLayer({ id: SURFACE, type: 'raster', source: SURFACE, paint: { 'raster-opacity': 0.72, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstLabel)
    const water = map.getStyle().layers.find((l) => l.id === 'water')
    if (water?.type === 'fill') map.addLayer({ ...water, id: COAST, paint: { 'fill-color': map.getPaintProperty('water', 'fill-color') as string } }, firstLabel)
    addStationLayers(map, actions.selectStation)
  }, [map])

  // Frames for the active variable; re-polled so a tab left open keeps up with new data.
  useEffect(() => {
    const ac = new AbortController()
    const load = () => getFrames(FRAME_LAYER[variable], ac.signal).then(actions.setFrames, (e) => e.name === 'AbortError' || setStatus('Could not load the timeline'))
    load()
    const timer = setInterval(load, 5 * 60e3)
    return () => { ac.abort(); clearInterval(timer) }
  }, [variable])

  // Draw the current frame.
  useEffect(() => {
    if (!map || !frame) return
    const ac = new AbortController()
    const source = map.getSource(SURFACE) as ImageSource
    const show = (field: Field) => {
      if (ac.signal.aborted) return
      paint(field, RAMPS[variable], canvas.current, LAND_ONLY[variable])
      if (map.getLayer(COAST)) map.setLayoutProperty(COAST, 'visibility', LAND_ONLY[variable] ? 'visible' : 'none')
      source.updateImage({ url: canvas.current.toDataURL(), coordinates: corners(field.bounds) })
    }
    const observations = getObservations(frame.time, ac.signal)

    ;(async () => {
      try {
        setStatus(null)
        if (variable === 'humidity') {
          landMask.current ??= getFrames('temperature-grid').then((f) => (f.length ? loadField(f[f.length - 1]) : null))
          const [mask, obs] = await Promise.all([landMask.current, observations])
          const byId = new Map(stations.map((s) => [s.id, s]))
          const points = obs.flatMap((o) => { const s = byId.get(o.stationId); return s && o.humidity != null ? [{ lon: s.longitude, lat: s.latitude, value: o.humidity }] : [] })
          if (mask) show(idw(points, mask))
        } else show(await loadField(frame))
      } catch (e) { if ((e as Error).name !== 'AbortError') { source.updateImage({ url: BLANK }); setStatus('No data for this time') } }
    })()

    observations.then((obs: Observation[]) => ac.signal.aborted || updateStations(map, stations, obs, variable, showStations), () => {})
    return () => ac.abort()
  }, [map, frame, variable, stations, showStations])

  // Warm the cache one frame ahead so playback doesn't stutter on the network.
  const frames = useStore((s) => s.frames), index = useStore((s) => s.index)
  useEffect(() => { const next: Frame | undefined = frames[index + 1]; if (next?.url) loadField(next).catch(() => {}) }, [frames, index])

  return status
}
