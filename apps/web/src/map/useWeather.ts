import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { getFrames, getObservations, getTyphoons, getWarnings, type Frame, type Observation, type Station } from '../api'
import { LAYERS } from '../layers'
import { STATUS, type Status } from '../status'
import { actions, currentFrame, latestIndex, useStore } from '../timeline/store'
import { corners, loadField, loadImage, loadWind, paint, type Field, type WindField } from './layers/grid'
import { idw } from './layers/idw'
import { startParticles } from './layers/particles'
import { hourly, speedAt } from './layers/wind'
import { addForecastLayers, countyFeatures, countyForecasts, forecastFrames, setForecastSelection, updateForecast } from './layers/forecast'
import { addStationLayers, updateStations, setStationsVisible } from './layers/stations'
import { addTyphoonLayers, cycloneBounds, setTyphoonsVisible, updateTyphoons } from './layers/typhoon'
import { addWarningLayers, countyBounds, updateWarnings, type Counties } from './layers/warnings'
import { HOME, REFERENCE_LAYER } from './basemap'

const SURFACE = 'surface'
const COAST = 'surface-coast' // copy of the basemap's water, drawn over land-only layers so the real coastline clips them
const OPACITY = { grid: 0.92, 'stations-idw': 0.92, image: 0.85, wind: 0.9, forecast: 0 } // the forecast is counties, not a surface
const FRAME_MS = 700 // how long a frame stays up at 1×

const scratch = () => Object.assign(document.createElement('canvas'), { width: 2, height: 2 })

/**
 * The part of the screen the panels leave free, measured from the panels themselves (`data-pad` marks them): the
 * sidebar and the alerts top-right on roomy screens, the layer row and alerts above and the legend and timeline
 * below on compact ones. A guess would be wrong as soon as an advisory is opened and the alerts grow.
 */
function panelPadding() {
  const gap = 12, W = window.innerWidth, H = window.innerHeight
  const rect = (name: string) => [...document.querySelectorAll<HTMLElement>(`[data-pad="${name}"]`)].find((el) => el.offsetParent)?.getBoundingClientRect()
  const layers = rect('layers'), alerts = rect('alerts'), legend = rect('legend'), timeline = rect('timeline')
  const bottom = H - Math.min(legend?.top ?? H, timeline?.top ?? H) + gap
  if (window.matchMedia('(min-width: 640px) and (min-height: 640px)').matches) {
    return { left: (layers?.right ?? 0) + gap, top: gap + 48, right: (alerts ? W - alerts.left : 48) + gap, bottom }
  }
  return { left: gap, top: Math.max(layers?.bottom ?? 0, alerts?.bottom ?? 0) + gap, right: gap, bottom }
}

/** Fly to `bounds` in the free part of the screen; where they cannot fit (a phone, or one on its side), centre `fallback` there instead. */
function flyToBounds(map: MapLibreMap, bounds: [number, number, number, number], fallback: [number, number] | undefined) {
  const padding = panelPadding()
  const camera = map.cameraForBounds(bounds, { padding, maxZoom: 7 })
  if (camera && camera.zoom! >= map.getMinZoom()) map.flyTo(camera)
  else if (fallback) map.flyTo({ center: fallback, zoom: map.getMinZoom(), padding })
}

/** Wires the store to the map: frames for the active layer, the crossfading surface, playback, and the station dots. */
export function useWeather(map: MapLibreMap | null, stations: Station[]) {
  const layerId = useStore((s) => s.layer), layer = LAYERS[layerId]
  const showStations = useStore((s) => s.showStations)
  const playing = useStore((s) => s.playing), speed = useStore((s) => s.speed)
  const frame = useStore(currentFrame)
  const [status, setStatus] = useState<Status>(null)
  const [stationStatus, setStationStatus] = useState<Status>(null)
  const refreshKey = useStore((s) => s.refreshKey)
  const [shown, setShown] = useState<Frame | null>(null) // the frame that is actually on the map
  // One layer of constant opacity; frames blend old→new INSIDE its canvas (DESIGN §13). Crossfading two map layers
  // instead dips: two half-faded translucent layers cover less than one full one, which read as a flicker per frame.
  const [surface] = useState(() => ({ canvas: scratch(), from: scratch(), to: scratch(), bounds: '', raf: 0, finish: null as (() => void) | null }))
  const speedNow = useRef(speed)
  speedNow.current = speed
  const since = useRef(0)
  // Humidity is interpolated onto CWA's temperature grid, whose land cells are Taiwan's outline. Fetched once and
  // shared; a failure or an empty timeline is forgotten so the next frame tries again.
  const landMask = useRef<Promise<Field | null> | null>(null)
  const getLandMask = () => landMask.current ??= getFrames('temperature-grid')
    .then((frames) => frames.length ? loadField(frames[frames.length - 1]) : null)
    .then((mask) => { if (!mask) landMask.current = null; return mask }, (e) => { landMask.current = null; throw e })
  // The wind field on the map, read by the particle loop every animation frame; null draws no particles.
  const windField = useRef<WindField | null>(null)
  // The 22 county outlines (a static file), fetched the first time an advisory is opened or the forecast layer is up;
  // a failure is forgotten so the next try fetches again.
  const counties = useRef<Promise<Counties> | null>(null)
  const getCounties = () => counties.current ??= fetch('/counties.json')
    .then((r) => r.ok ? r.json() as Promise<Counties> : Promise.reject(new Error(`counties: ${r.status}`)))
    .catch((e) => { counties.current = null; throw e })

  useEffect(() => {
    if (!map) return
    const firstLabel = REFERENCE_LAYER // geography references remain above the weather and its land mask
    map.addSource(SURFACE, { type: 'canvas', canvas: surface.canvas, coordinates: corners([119, 21, 123, 26]), animate: false })
    map.addLayer({ id: SURFACE, type: 'raster', source: SURFACE, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 0, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstLabel)
    const water = map.getStyle().layers.find((l) => l.id === 'water')
    if (water?.type === 'fill') map.addLayer({ ...water, id: COAST, paint: { 'fill-color': map.getPaintProperty('water', 'fill-color') as string } }, firstLabel)
    const removeForecast = addForecastLayers(map, firstLabel, actions.selectCounty) // the week's county colours, under the roads and names like the surface
    const removeWarnings = addWarningLayers(map) // over the weather and the coast clip (澎湖 is mostly sea), under the typhoons and stations
    const removeTyphoons = addTyphoonLayers(map) // a track crosses the sea too
    const removeStations = addStationLayers(map, actions.selectStation)
    return () => {
      cancelAnimationFrame(surface.raf)
      surface.finish?.()
      surface.finish = null
      ;(map.getSource(SURFACE) as CanvasSource | undefined)?.pause()
      removeStations()
      removeTyphoons()
      removeWarnings()
      removeForecast()
      for (const id of [COAST, SURFACE]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SURFACE)) map.removeSource(SURFACE)
    }
  }, [map])

  // Never label an old weather surface as a newly selected product.
  useEffect(() => {
    if (!map) return
    cancelAnimationFrame(surface.raf)
    surface.finish?.()
    surface.finish = null
    ;(map.getSource(SURFACE) as CanvasSource | undefined)?.pause()
    map.setPaintProperty(SURFACE, 'raster-opacity', 0)
    map.setLayoutProperty(COAST, 'visibility', 'none')
    surface.bounds = ''
    surface.canvas.getContext('2d')!.clearRect(0, 0, surface.canvas.width, surface.canvas.height)
    windField.current = null
    updateForecast(map, null)
    setStationsVisible(map, false)
    setShown(null)
    setStatus(null)
    setStationStatus(null)
  }, [map, layerId])

  // The particles exist only while the wind layer is up; they follow whatever field the frame effect below has loaded.
  // They go under the place names (the basemap's first symbol layer), and so under the overlays appended after those.
  useEffect(() => {
    if (!map || layer.kind !== 'wind') return
    return startParticles(map, () => windField.current, map.getStyle().layers.find((l) => l.type === 'symbol')?.id)
  }, [map, layer.kind])

  // Frames for the active layer; re-polled so a tab left open keeps up with new data.
  useEffect(() => {
    const ac = new AbortController()
    const load = () => {
      const token = actions.beginLoad(layerId)
      ;(layer.kind === 'forecast' ? Promise.resolve(forecastFrames()) : getFrames(layer.frames, ac.signal)).then(
        (frames) => { if (!ac.signal.aborted) actions.setFrames(layerId, token, layer.kind === 'wind' ? hourly(frames) : frames) },
        (e) => { if (e.name !== 'AbortError' && !ac.signal.aborted) actions.failLoad(layerId, token) },
      )
    }
    load()
    const timer = setInterval(load, 5 * 60e3)
    return () => { ac.abort(); clearInterval(timer) }
  }, [layerId, layer.frames, layer.kind, refreshKey])

  // Draw the current frame.
  useEffect(() => {
    if (!map) return
    if (!frame) {
      map.setPaintProperty(SURFACE, 'raster-opacity', 0)
      surface.bounds = ''
      windField.current = null
      updateForecast(map, null)
      setStationsVisible(map, false)
      setShown(null)
      setStatus(null)
      return
    }
    // The forecast's townships come from the station list: until it arrives nothing can be drawn, so the frame is
    // not "shown" (playback waits) and the effect runs again when the list is here. If it never comes, the timeline's
    // station-list error outranks this status.
    if (layer.kind === 'forecast' && !stations.length) return setStatus(STATUS.loadingWeather)
    let alive = true
    setShown(null)
    since.current = performance.now()
    const s = surface
    setStatus(null)
    const loading = setTimeout(() => { if (alive) setStatus(STATUS.loadingWeather) }, 250)

    /** Blend from whatever is on screen (even a half-finished blend) to `next`. A different size or place is a cut. */
    const show = (next: HTMLCanvasElement | OffscreenCanvas, bounds: Field['bounds']) => new Promise<void>((resolve) => {
      clearTimeout(loading)
      setStatus(null)
      const source = map.getSource(SURFACE) as CanvasSource, ctx = s.canvas.getContext('2d')!
      cancelAnimationFrame(s.raf)
      s.finish?.()
      s.finish = resolve
      const blend = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && s.canvas.width === next.width && s.canvas.height === next.height && s.bounds === bounds.join()
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
        else { source.pause(); s.finish = null; resolve() }
      }
      step()
    })

    ;(async () => {
      try {
        if (layer.kind === 'image') {
          const image = await loadImage(frame.url!, frame.bounds!)
          if (alive) await show(image, frame.bounds!)
        } else if (layer.kind === 'stations-idw') {
          const [mask, obs] = await Promise.all([getLandMask(), getObservations(frame.time)])
          if (!alive) return
          if (!mask) {
            map.setPaintProperty(SURFACE, 'raster-opacity', 0)
            s.bounds = ''
            return setStatus(STATUS.noHumidity)
          }
          const byId = new Map(stations.map((s) => [s.id, s]))
          const points = obs.flatMap((o) => { const s = byId.get(o.stationId), v = o.humidity; return s && v != null ? [{ lon: s.longitude, lat: s.latitude, value: v }] : [] })
          if (points.length < 3) throw new Error('Insufficient station readings')
          const field = idw(points, mask)
          paint(field, layer.legend, s.to, true)
          await show(s.to, field.bounds)
        } else if (layer.kind === 'wind') {
          const field = await loadWind(frame)
          if (!alive) return
          windField.current = field // the particles pick it up on their next animation frame
          paint(field, layer.legend, s.to) // the surface is the speed; the particles are the direction
          await show(s.to, field.bounds)
        } else if (layer.kind === 'forecast') {
          const [outlines, week] = await Promise.all([getCounties(), countyForecasts(stations)]) // 22 townships, cached in api.ts
          if (!alive) return
          clearTimeout(loading)
          updateForecast(map, countyFeatures(outlines, week, frame.time))
        } else {
          const field = await loadField(frame)
          if (!alive) return
          paint(field, layer.legend, s.to, layer.landOnly)
          await show(s.to, field.bounds)
        }
        if (alive) setStatus(null)
      } catch {
        if (!alive) return
        map.setPaintProperty(SURFACE, 'raster-opacity', 0)
        s.bounds = '' // the next good frame cuts in instead of blending from a picture nobody saw
        windField.current = null
        updateForecast(map, null)
        setStatus(STATUS.noData)
      } finally { clearTimeout(loading); if (alive) setShown(frame) } // a hole in the data must not stall playback either
    })()
    return () => {
      alive = false
      clearTimeout(loading)
      cancelAnimationFrame(s.raf)
      s.finish?.()
      s.finish = null
      ;(map.getSource(SURFACE) as CanvasSource | undefined)?.pause()
    }
  }, [map, frame, layer, stations, refreshKey])

  // Playback waits for the picture: the clock moves on only once the current frame is on the map, so a slow layer
  // (radar: fetch + decode a 3600² PNG) plays slower instead of being aborted by the next tick before it ever shows.
  useEffect(() => {
    if (!playing || shown !== frame) return
    const timer = setTimeout(actions.tick, Math.max(0, FRAME_MS / speed - (performance.now() - since.current)))
    return () => clearTimeout(timer)
  }, [playing, shown, frame, speed])

  const frames = useStore((s) => s.frames), index = useStore((s) => s.index)
  const future = !!frame && Date.parse(frame.time) > Date.now()
  useEffect(() => {
    if (!map) return
    setStationStatus(null)
    // The previous frame's stations stay up until this one's replace them: hiding them in between blinks every label.
    // A frame ahead of now (the wind forecast) has no readings: the effect below puts the forecast on the dots instead.
    // A layer without a station variable (the forecast's counties) draws no dots at all.
    const variable = layer.stations
    if (!frame || !showStations || !variable || (future && layer.kind !== 'wind')) return setStationsVisible(map, false)
    if (future) return
    let alive = true
    getObservations(frame.time).then((obs) => {
      if (!alive) return
      updateStations(map, stations, obs, variable)
      if (!obs.length) setStationStatus(STATUS.noStationReadings)
    }, () => {
      if (!alive) return
      setStationsVisible(map, false) // the previous frame's values must not pass for this time's
      setStationStatus(STATUS.stationReadingsFailed)
    })
    return () => { alive = false }
  }, [map, frame, future, layer.kind, layer.stations, stations, showStations, refreshKey])

  // Ahead of now the dots carry the forecast: the field's speed at each station that reported wind at the newest
  // observation (so rain gauges stay off the map), drawn inverted (stations.ts) once this frame's field is on the map.
  useEffect(() => {
    const field = windField.current
    if (!map || !frame || !future || !showStations || layer.kind !== 'wind' || shown !== frame) return
    if (!field) return setStationsVisible(map, false)
    const newest = frames[latestIndex(frames)]
    if (!newest) return
    let alive = true
    getObservations(newest.time).then((obs) => {
      if (!alive) return
      const anemometers = new Set(obs.filter((o) => o.windSpeed != null).map((o) => o.stationId))
      const forecast = stations.filter((s) => anemometers.has(s.id)).map((s) => {
        const v = speedAt(field, s.longitude, s.latitude)
        return { stationId: s.id, windSpeed: Number.isNaN(v) ? null : v } as Observation // ponytail: only windSpeed is read for this variable
      })
      updateStations(map, stations, forecast, 'wind', true)
    }, () => { if (alive) setStationsVisible(map, false) })
    return () => { alive = false }
  }, [map, frame, future, shown, showStations, layer.kind, stations, frames, refreshKey])

  // Active typhoons: fetched on their own clock (CWA reissues every 3–6 h), drawn whatever layer is up. A failed fetch
  // keeps whatever was drawn; there is no status for it, the chip simply does not appear.
  const typhoons = useStore((s) => s.typhoons), typhoonFocus = useStore((s) => s.typhoonFocus)
  useEffect(() => {
    const ac = new AbortController()
    const load = () => getTyphoons(ac.signal).then(actions.setTyphoons, () => {})
    load()
    const timer = setInterval(load, 10 * 60e3)
    return () => { ac.abort(); clearInterval(timer) }
  }, [refreshKey])
  useEffect(() => { if (map) updateTyphoons(map, typhoons) }, [map, typhoons])
  useEffect(() => {
    const cyclone = typhoonFocus && typhoons[typhoonFocus.index], bounds = cyclone && cycloneBounds(cyclone)
    if (!map || !bounds) return
    const now = cyclone.analysis.at(-1) ?? cyclone.forecast[0]
    flyToBounds(map, bounds, now && [now.lon, now.lat])
  }, [map, typhoonFocus]) // not `typhoons`: a refreshed list must not fly the viewer back
  // Playback is about the weather moving: the tracks go away for it, and a viewer who had flown out to a storm comes home.
  useEffect(() => {
    if (!map) return
    setTyphoonsVisible(map, !playing)
    const { lng, lat } = map.getCenter(), [w, s, e, n] = HOME.bounds
    if (playing && (lng < w || lng > e || lat < s || lat > n)) map.flyTo({ center: HOME.center, zoom: HOME.zoom })
  }, [map, playing])

  // The county the forecast card shows is outlined on the map (the source is empty on every other layer).
  const selectedCounty = useStore((s) => s.selectedCounty)
  useEffect(() => { if (map) setForecastSelection(map, selectedCounty) }, [map, selectedCounty])

  // County advisories, same pattern. The map draws only the advisory the viewer opened in the panel.
  const warnings = useStore((s) => s.warnings), warningFocus = useStore((s) => s.warningFocus)
  useEffect(() => {
    const ac = new AbortController()
    const load = () => getWarnings(ac.signal).then(actions.setWarnings, () => {})
    load()
    const timer = setInterval(load, 5 * 60e3)
    return () => { ac.abort(); clearInterval(timer) }
  }, [refreshKey])
  useEffect(() => {
    if (!map) return
    if (warningFocus == null) return updateWarnings(map, null, [], null)
    let alive = true
    getCounties().then((c) => { if (alive) updateWarnings(map, c, warnings, warningFocus) }, () => {})
    return () => { alive = false }
  }, [map, warnings, warningFocus])
  // Opening an advisory also brings its counties into view (a refreshed list keeps the focus and must not fly again).
  useEffect(() => {
    if (!map || warningFocus == null) return
    let alive = true
    counties.current?.then((c) => {
      const bounds = alive && warnings[warningFocus] && countyBounds(c, warnings[warningFocus].counties)
      if (bounds) flyToBounds(map, bounds, undefined)
    }, () => {})
    return () => { alive = false }
  }, [map, warningFocus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Warm the caches two frames ahead so playback doesn't stutter on the network.
  useEffect(() => {
    for (const next of frames.slice(index + 1, index + 3)) {
      if ((layer.kind === 'stations-idw' || (showStations && layer.stations)) && Date.parse(next.time) <= Date.now()) getObservations(next.time).catch(() => {})
      if (next.url || next.between) (layer.kind === 'image' ? loadImage(next.url!, next.bounds!) : layer.kind === 'wind' ? loadWind(next) : loadField(next)).catch(() => {})
    }
  }, [frames, index, layer.kind, layer.stations, showStations])

  return status ?? stationStatus
}
