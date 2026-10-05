import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 looks for its worker next to its own module URL, which a bundler breaks; let Vite bundle it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import type { Station } from '../api'
import { useT } from '../i18n'
import { STATUS, type Status } from '../status'
import { useWeather } from './useWeather'
import { setPlaceLanguage, weatherBasemap } from './basemap'

setWorkerUrl(workerUrl)

// Reuse the provider's sources and place filters; basemap.ts selects and restyles only weather-relevant context.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'

// Taiwan + surrounding sea; matches the radar/wind crop so layers never end mid-screen at min zoom.
const BOUNDS: [number, number, number, number] = [115, 17.75, 126.5, 29.25]

export default function MapView({ stations, onStatus }: { stations: Station[]; onStatus: (s: Status) => void }) {
  const { t, lang } = useT()
  const el = useRef<HTMLDivElement>(null)
  const langNow = useRef(lang) // read when the style arrives, which is after this render
  langNow.current = lang
  const [map, setMap] = useState<MapLibreMap | null>(null)

  useEffect(() => {
    const m = new MapLibreMap({
      container: el.current!,
      center: [120.97, 23.7],
      zoom: 6.5,
      minZoom: 4,
      maxBounds: [BOUNDS[0] - 10, BOUNDS[1] - 8, BOUNDS[2] + 10, BOUNDS[3] + 8],
      attributionControl: false, // added below, top-right: the default bottom corner sits under the timeline
    })
    m.setStyle(STYLE_URL, {
      transformStyle: (_, next) => weatherBasemap(next, langNow.current),
    })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new AttributionControl({ compact: true }), 'top-right')
    // MapLibre opens a compact attribution as soon as it has text, unless it already carries this class; open, it
    // covers our panels. Starting as the (i) button keeps the credit one tap away, as OSM/OpenFreeMap's terms require.
    el.current!.querySelector('.maplibregl-ctrl-attrib')?.classList.add('maplibregl-compact')
    m.once('load', () => setMap(m))
    return () => { setMap(null); m.remove() }
  }, [])

  // MapLibre names its controls once, in English. They are few, so they are simply renamed in place, which also
  // follows a language switch without rebuilding the map.
  useEffect(() => {
    const names = { '.maplibregl-ctrl-zoom-in': 'map.zoomIn', '.maplibregl-ctrl-zoom-out': 'map.zoomOut', '.maplibregl-ctrl-attrib-button': 'map.attribution', '.maplibregl-canvas': 'map.title' } as const
    for (const [selector, key] of Object.entries(names) as [string, (typeof names)[keyof typeof names]][]) {
      const control = el.current?.querySelector<HTMLElement>(selector)
      if (!control) continue
      control.setAttribute('aria-label', t(key))
      if (control.title) control.title = t(key)
    }
  }, [t])
  useEffect(() => { if (map) setPlaceLanguage(map, lang) }, [map, lang])

  const status = useWeather(map, stations)
  // Until the map exists the timeline may already be loaded; say why there is no weather to see yet.
  useEffect(() => onStatus(map ? status : STATUS.loadingMap), [map, status, onStatus])

  // Sized wrapper: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which would override `absolute` on the map node itself.
  return <div className="absolute inset-0"><div ref={el} className="h-full w-full" /></div>
}
