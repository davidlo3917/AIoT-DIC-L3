import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 looks for its worker next to its own module URL, which a bundler breaks; let Vite bundle it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import type { Station } from '../api'
import { useWeather } from './useWeather'
import { weatherBasemap } from './basemap'

setWorkerUrl(workerUrl)

// Reuse the provider's sources and place filters; basemap.ts selects and restyles only weather-relevant context.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'

// Taiwan + surrounding sea; matches the radar/wind crop so layers never end mid-screen at min zoom.
const BOUNDS: [number, number, number, number] = [115, 17.75, 126.5, 29.25]

export default function MapView({ stations, onStatus }: { stations: Station[]; onStatus: (s: string | null) => void }) {
  const el = useRef<HTMLDivElement>(null)
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
      transformStyle: (_, next) => weatherBasemap(next),
    })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new AttributionControl({ compact: true }), 'top-right')
    m.once('load', () => {
      // MapLibre opens the compact attribution until the first map drag, which covers our panels; collapse it to
      // its (i) button once it has rendered. The credit stays one tap away, as OSM/OpenFreeMap's terms require.
      const attrib = el.current?.querySelector('.maplibregl-ctrl-attrib')
      attrib?.classList.remove('maplibregl-compact-show')
      attrib?.removeAttribute('open')
      setMap(m)
    })
    return () => { setMap(null); m.remove() }
  }, [])

  const status = useWeather(map, stations)
  useEffect(() => onStatus(status), [status, onStatus])

  // Sized wrapper: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which would override `absolute` on the map node itself.
  return <div className="absolute inset-0"><div ref={el} className="h-full w-full" /></div>
}
