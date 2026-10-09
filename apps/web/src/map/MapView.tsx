import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 looks for its worker next to its own module URL, which a bundler breaks; let Vite bundle it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import type { Station } from '../api'
import { t } from '../i18n'
import { STATUS, type Status } from '../status'
import { useWeather } from './useWeather'
import { HOME, weatherBasemap } from './basemap'

setWorkerUrl(workerUrl)

// Reuse the provider's sources and place filters; basemap.ts selects and restyles only weather-relevant context.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'

export default function MapView({ stations, onStatus }: { stations: Station[]; onStatus: (s: Status) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const m = new MapLibreMap({
      container: el.current!,
      center: HOME.center,
      zoom: HOME.zoom,
      minZoom: 4,
      maxBounds: [100, 0, 180, 50], // CWA's whole typhoon basin: a track usually starts far out in the Pacific
      // A label whose text changes (25.0 → 25.3) counts as a new one, and would fade in from nothing on every frame.
      fadeDuration: 0,
      // North stays up: nothing here needs a turned map, and the wind particles map the screen to the world linearly.
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
      attributionControl: false, // added below, top-right: the default bottom corner sits under the timeline
      locale: { 'Map.Title': t('map.title'), 'NavigationControl.ZoomIn': t('map.zoomIn'), 'NavigationControl.ZoomOut': t('map.zoomOut'), 'AttributionControl.ToggleAttribution': t('map.attribution') },
    })
    // Until the style has arrived any error (the tile host being down) means no map at all; the page says so instead
    // of "loading" forever. A stray tile error is cleared again by `load`.
    m.touchZoomRotate.disableRotation()
    m.keyboard.disableRotation()
    m.on('error', () => { if (!m.loaded()) setFailed(true) })
    m.setStyle(STYLE_URL, {
      transformStyle: (_, next) => weatherBasemap(next),
    })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new AttributionControl({ compact: true }), 'top-right')
    // MapLibre opens a compact attribution as soon as it has text, unless it already carries this class; open, it
    // covers our panels. Starting as the (i) button keeps the credit one tap away, as OSM/OpenFreeMap's terms require.
    el.current!.querySelector('.maplibregl-ctrl-attrib')?.classList.add('maplibregl-compact')
    m.once('load', () => { setFailed(false); setMap(m) })
    return () => { setMap(null); m.remove() }
  }, [])

  const status = useWeather(map, stations)
  // Until the map exists the timeline may already be loaded; say why there is no weather to see yet.
  useEffect(() => onStatus(map ? status : failed ? STATUS.mapFailed : STATUS.loadingMap), [map, status, failed, onStatus])

  // Sized wrapper: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which would override `absolute` on the map node itself.
  return <div className="absolute inset-0"><div ref={el} className="h-full w-full" /></div>
}
