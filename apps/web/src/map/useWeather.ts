import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { getFrames, getObservations, type Frame, type Observation, type Station } from '../api'
import { LAYERS } from '../layers'
import { actions, currentFrame, useStore } from '../timeline/store'
import { loadField, loadImage, paint, paintImage, type Field } from './layers/grid'
import { idw } from './layers/idw'
import { addStationLayers, updateStations } from './layers/stations'

// Two surfaces, A and B: each new frame is drawn on the hidden one and the pair crossfades (DESIGN §13).
const SLOTS = ['surface-a', 'surface-b'] as const
const COAST = 'surface-coast' // copy of the basemap's water, drawn over land-only layers so the real coastline clips them
const OPACITY = { grid: 0.72, 'stations-idw': 0.72, image: 0.85 }

const corners = ([w, s, e, n]: Field['bounds']) => [[w, n], [e, n], [e, s], [w, s]] as [[number, number], [number, number], [number, number], [number, number]]

/** Wires the store to the map: frames for the active layer, the crossfading surface, and the station dots. */
export function useWeather(map: MapLibreMap | null, stations: Station[]) {
  const layerId = useStore((s) => s.layer), layer = LAYERS[layerId]
  const showStations = useStore((s) => s.showStations)
  const speed = useStore((s) => s.speed)
  const frame = useStore(currentFrame)
  const [status, setStatus] = useState<string | null>(null)
  const canvases = useRef(SLOTS.map(() => Object.assign(document.createElement('canvas'), { width: 2, height: 2 })))
  const front = useRef(0)
  const landMask = useRef<Promise<Field | null> | null>(null)

  useEffect(() => {
    if (!map) return
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id // keep place names above the surface
    SLOTS.forEach((id, i) => {
      map.addSource(id, { type: 'canvas', canvas: canvases.current[i], coordinates: corners([119, 21, 123, 26]), animate: false })
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstLabel)
    })
    const water = map.getStyle().layers.find((l) => l.id === 'water')
    if (water?.type === 'fill') map.addLayer({ ...water, id: COAST, paint: { 'fill-color': map.getPaintProperty('water', 'fill-color') as string } }, firstLabel)
    addStationLayers(map, actions.selectStation)
  }, [map])

  // Frames for the active layer; re-polled so a tab left open keeps up with new data.
  useEffect(() => {
    const ac = new AbortController()
    const load = () => getFrames(layer.frames, ac.signal).then(actions.setFrames, (e) => e.name === 'AbortError' || setStatus('Could not load the timeline'))
    load()
    const timer = setInterval(load, 5 * 60e3)
    return () => { ac.abort(); clearInterval(timer) }
  }, [layer.frames])

  // Draw the current frame.
  useEffect(() => {
    if (!map || !frame) return
    const ac = new AbortController()
    const fade = (toFront: number | null) => SLOTS.forEach((id, i) => {
      map.setPaintProperty(id, 'raster-opacity-transition', { duration: Math.min(350, 450 / speed), delay: 0 })
      map.setPaintProperty(id, 'raster-opacity', i === toFront ? OPACITY[layer.kind] : 0)
    })
    /** `draw` paints the hidden canvas and returns the geographic box it covers. */
    const present = (draw: (canvas: HTMLCanvasElement) => Field['bounds']) => {
      if (ac.signal.aborted) return
      const back = 1 - front.current, source = map.getSource(SLOTS[back]) as CanvasSource
      source.setCoordinates(corners(draw(canvases.current[back])))
      source.play(); source.pause() // a static canvas source re-uploads its texture exactly once per play/pause
      if (map.getLayer(COAST)) map.setLayoutProperty(COAST, 'visibility', layer.landOnly ? 'visible' : 'none')
      fade(back)
      front.current = back
    }
    const observations = getObservations(frame.time, ac.signal)

    ;(async () => {
      try {
        setStatus(null)
        if (layer.kind === 'image') {
          const bitmap = await loadImage(frame.url!)
          present((c) => (paintImage(bitmap, frame.bounds!, c), frame.bounds!))
        } else if (layer.kind === 'stations-idw') {
          landMask.current ??= getFrames('temperature-grid').then((f) => (f.length ? loadField(f[f.length - 1]) : null))
          const [mask, obs] = await Promise.all([landMask.current, observations])
          if (!mask) return setStatus('Waiting for the first temperature grid (it supplies the land outline)')
          const byId = new Map(stations.map((s) => [s.id, s]))
          const field = idw(obs.flatMap((o) => { const s = byId.get(o.stationId), v = o[layer.stations === 'humidity' ? 'humidity' : 'temperature']; return s && v != null ? [{ lon: s.longitude, lat: s.latitude, value: v }] : [] }), mask)
          present((c) => (paint(field, layer.legend, c, true), field.bounds))
        } else {
          const field = await loadField(frame)
          present((c) => (paint(field, layer.legend, c, layer.landOnly), field.bounds))
        }
      } catch (e) { if ((e as Error).name !== 'AbortError' && !ac.signal.aborted) { fade(null); setStatus('No data for this time') } }
    })()

    observations.then((obs: Observation[]) => ac.signal.aborted || updateStations(map, stations, obs, layer.stations, showStations), () => {})
    return () => ac.abort()
  }, [map, frame, layer, stations, showStations, speed])

  // Warm the cache one frame ahead so playback doesn't stutter on the network.
  const frames = useStore((s) => s.frames), index = useStore((s) => s.index)
  useEffect(() => {
    const next: Frame | undefined = frames[index + 1]
    if (next?.url) (layer.kind === 'image' ? loadImage(next.url) : loadField(next)).catch(() => {})
  }, [frames, index, layer.kind])

  return status
}
