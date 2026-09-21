import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { getFrames, getObservations, type Frame, type Station } from '../api'
import { LAYERS } from '../layers'
import { actions, currentFrame, useStore } from '../timeline/store'
import { loadField, loadImage, paint, type Field } from './layers/grid'
import { idw } from './layers/idw'
import { addStationLayers, updateStations } from './layers/stations'

const SURFACE = 'surface'
const COAST = 'surface-coast' // copy of the basemap's water, drawn over land-only layers so the real coastline clips them
const OPACITY = { grid: 0.72, 'stations-idw': 0.72, image: 0.85 }
const FRAME_MS = 700 // how long a frame stays up at 1×

const corners = ([w, s, e, n]: Field['bounds']) => [[w, n], [e, n], [e, s], [w, s]] as [[number, number], [number, number], [number, number], [number, number]]
const scratch = () => Object.assign(document.createElement('canvas'), { width: 2, height: 2 })

/** Wires the store to the map: frames for the active layer, the crossfading surface, playback, and the station dots. */
export function useWeather(map: MapLibreMap | null, stations: Station[]) {
  const layerId = useStore((s) => s.layer), layer = LAYERS[layerId]
  const showStations = useStore((s) => s.showStations)
  const playing = useStore((s) => s.playing), speed = useStore((s) => s.speed)
  const frame = useStore(currentFrame)
  const [status, setStatus] = useState<string | null>(null)
  const [shown, setShown] = useState<Frame | null>(null) // the frame that is actually on the map
  // One layer of constant opacity; frames blend old→new INSIDE its canvas (DESIGN §13). Crossfading two map layers
  // instead dips: two half-faded translucent layers cover less than one full one, which read as a flicker per frame.
  const surface = useRef({ canvas: scratch(), from: scratch(), to: scratch(), bounds: '', raf: 0 })
  const speedNow = useRef(speed)
  speedNow.current = speed
  const since = useRef(0)
  const landMask = useRef<Promise<Field | null> | null>(null)

  useEffect(() => {
    if (!map) return
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id // keep place names above the surface
    map.addSource(SURFACE, { type: 'canvas', canvas: surface.current.canvas, coordinates: corners([119, 21, 123, 26]), animate: false })
    map.addLayer({ id: SURFACE, type: 'raster', source: SURFACE, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 0, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstLabel)
    const water = map.getStyle().layers.find((l) => l.id === 'water')
    if (water?.type === 'fill') map.addLayer({ ...water, id: COAST, paint: { 'fill-color': map.getPaintProperty('water', 'fill-color') as string } }, firstLabel)
    addStationLayers(map, actions.selectStation)
    const s = surface.current
    return () => cancelAnimationFrame(s.raf)
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
    let alive = true
    since.current = performance.now()
    const s = surface.current

    /** Blend from whatever is on screen (even a half-finished blend) to `next`. A different size or place is a cut. */
    const show = (next: HTMLCanvasElement | OffscreenCanvas, bounds: Field['bounds']) => {
      const source = map.getSource(SURFACE) as CanvasSource, ctx = s.canvas.getContext('2d')!
      cancelAnimationFrame(s.raf)
      const blend = s.canvas.width === next.width && s.canvas.height === next.height && s.bounds === bounds.join()
      if (blend) {
        s.from.width = next.width
        s.from.height = next.height
        s.from.getContext('2d')!.drawImage(s.canvas, 0, 0)
      } else {
        s.canvas.width = next.width
        s.canvas.height = next.height
        source.setCoordinates(corners(bounds)) // only on change: it reloads the source, which blanks it for a frame
        s.bounds = bounds.join()
      }
      map.setPaintProperty(SURFACE, 'raster-opacity', OPACITY[layer.kind])
      if (map.getLayer(COAST)) map.setLayoutProperty(COAST, 'visibility', layer.landOnly ? 'visible' : 'none')
      // A cut keeps uploading for a moment too: right after setCoordinates the source has no tiles for a frame or
      // two, and MapLibre silently drops an upload made then.
      const start = performance.now(), ms = blend ? Math.min(350, 450 / speedNow.current) : 150
      source.play() // a canvas source uploads its texture every frame while playing, and once more on pause
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / ms), a = blend ? t : 1
        ctx.clearRect(0, 0, next.width, next.height)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1 - a
        if (a < 1) ctx.drawImage(s.from, 0, 0)
        ctx.globalCompositeOperation = 'lighter' // adds: old·(1−a) + new·a, exact for colour and for alpha (radar's moving edges)
        ctx.globalAlpha = a
        ctx.drawImage(next, 0, 0)
        if (t < 1) s.raf = requestAnimationFrame(step)
        else source.pause()
      }
      step()
    }

    ;(async () => {
      try {
        setStatus(null)
        if (layer.kind === 'image') {
          const image = await loadImage(frame.url!, frame.bounds!)
          if (alive) show(image, frame.bounds!)
        } else if (layer.kind === 'stations-idw') {
          landMask.current ??= getFrames('temperature-grid').then((f) => (f.length ? loadField(f[f.length - 1]) : null))
          const [mask, obs] = await Promise.all([landMask.current, getObservations(frame.time)])
          if (!alive) return
          if (!mask) return setStatus('Waiting for the first temperature grid (it supplies the land outline)')
          const byId = new Map(stations.map((s) => [s.id, s]))
          const field = idw(obs.flatMap((o) => { const s = byId.get(o.stationId), v = o[layer.stations === 'humidity' ? 'humidity' : 'temperature']; return s && v != null ? [{ lon: s.longitude, lat: s.latitude, value: v }] : [] }), mask)
          paint(field, layer.legend, s.to, true)
          show(s.to, field.bounds)
        } else {
          const field = await loadField(frame)
          if (!alive) return
          paint(field, layer.legend, s.to, layer.landOnly)
          show(s.to, field.bounds)
        }
      } catch {
        if (!alive) return
        map.setPaintProperty(SURFACE, 'raster-opacity', 0)
        s.bounds = '' // the next good frame cuts in instead of blending from a picture nobody saw
        setStatus('No data for this time')
      } finally { if (alive) setShown(frame) } // a hole in the data must not stall playback either
    })()
    return () => { alive = false }
  }, [map, frame, layer, stations])

  // Playback waits for the picture: the clock moves on only once the current frame is on the map, so a slow layer
  // (radar: fetch + decode a 3600² PNG) plays slower instead of being aborted by the next tick before it ever shows.
  useEffect(() => {
    if (!playing || shown !== frame) return
    const timer = setTimeout(actions.tick, Math.max(0, FRAME_MS / speed - (performance.now() - since.current)))
    return () => clearTimeout(timer)
  }, [playing, shown, frame, speed])

  useEffect(() => {
    if (!map || !frame) return
    let alive = true
    getObservations(frame.time).then((obs) => alive && updateStations(map, stations, obs, layer.stations, showStations), () => {})
    return () => { alive = false }
  }, [map, frame, layer.stations, stations, showStations])

  // Warm the caches two frames ahead so playback doesn't stutter on the network.
  const frames = useStore((s) => s.frames), index = useStore((s) => s.index)
  useEffect(() => {
    for (const next of frames.slice(index + 1, index + 3)) {
      if (layer.kind === 'stations-idw' || showStations) getObservations(next.time).catch(() => {})
      if (next.url) (layer.kind === 'image' ? loadImage(next.url, next.bounds!) : loadField(next)).catch(() => {})
    }
  }, [frames, index, layer.kind, showStations])

  return status
}
