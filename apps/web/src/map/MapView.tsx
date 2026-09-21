import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 looks for its worker next to its own module URL, which a bundler breaks; let Vite bundle it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'

setWorkerUrl(workerUrl)

// OpenFreeMap "fiord" with land and sea pushed apart: stock dark styles put the coastline at ~3% contrast,
// which vanishes on a real screen. Dark enough for radar/particle overlays, light enough to read the island.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'
const BASEMAP_PAINT: Record<string, Record<string, string>> = {
  background: { 'background-color': '#4a5a78' }, // land
  water: { 'fill-color': '#141d2f' },
}

// Taiwan + surrounding sea; matches the radar/wind crop so layers never end mid-screen at min zoom.
const BOUNDS: [number, number, number, number] = [115, 17.75, 126.5, 29.25]

export default function MapView() {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = new MapLibreMap({
      container: el.current!,
      center: [120.97, 23.7],
      zoom: 6.5,
      minZoom: 4,
      maxBounds: [BOUNDS[0] - 10, BOUNDS[1] - 8, BOUNDS[2] + 10, BOUNDS[3] + 8],
      attributionControl: { compact: true },
    })
    map.setStyle(STYLE_URL, {
      transformStyle: (_, next) => ({
        ...next,
        layers: next.layers.map((l) => (BASEMAP_PAINT[l.id] ? { ...l, paint: { ...l.paint, ...BASEMAP_PAINT[l.id] } } as typeof l : l)),
      }),
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    return () => map.remove()
  }, [])

  // Sized wrapper: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which would override `absolute` on the map node itself.
  return <div className="absolute inset-0"><div ref={el} className="h-full w-full" /></div>
}
