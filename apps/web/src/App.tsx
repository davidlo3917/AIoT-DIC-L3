import { useEffect, useState } from 'react'
import { getStations, type Station } from './api'
import LayerPanel, { StationsToggle } from './components/LayerPanel'
import Legend from './components/Legend'
import StationCard from './components/StationCard'
import MapView from './map/MapView'
import Timeline from './timeline/Timeline'
import { useStore } from './timeline/store'

export default function App() {
  const [status, setStatus] = useState<string | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [stationError, setStationError] = useState<string | null>(null)
  const refreshKey = useStore((s) => s.refreshKey)
  const selectedStation = useStore((s) => s.selectedStation)
  useEffect(() => {
    let alive = true
    setStationError(null)
    getStations().then((rows) => { if (alive) setStations(rows) }, () => { if (alive) setStationError('Could not load the station list') })
    return () => { alive = false }
  }, [refreshKey])

  return (
    <div className="relative h-full w-full overflow-hidden text-slate-100">
      <MapView stations={stations} onStatus={setStatus} />
      {/* Overlay chrome ignores the pointer except on the panels themselves, so the map stays draggable everywhere else. */}
      <div className="app-chrome pointer-events-none absolute inset-0 flex flex-col gap-2">
        {/* A phone on its side keeps about 300 px under the browser's own bars; the title gives way there. */}
        <header className="flex flex-wrap items-baseline gap-x-2 pr-14 [@media(max-height:339px)]:hidden">
          <h1 className="text-base font-semibold tracking-wide drop-shadow">Weather Taiwan</h1>
          <p className="ui-muted text-xs">Data: Central Weather Administration (CWA)</p>
        </header>
        {/* The one region that gives: its panels shrink and scroll, so the legend and timeline below never leave the screen. */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row">
          {/* pr-14 keeps the phone's layer row clear of the map controls. */}
          <div className="flex min-h-0 min-w-0 shrink-0 flex-col pr-14 sm:pr-0"><LayerPanel /></div>
          <div className="mt-auto flex min-h-0 min-w-0 flex-col sm:mr-16 sm:mt-0 sm:ml-auto"><StationCard key={selectedStation} stations={stations} /></div>
        </div>
        {/* On compact layouts this row makes way for an open station card. */}
        <div className={`${selectedStation !== null ? 'hidden desk:flex' : 'flex'} flex-row-reverse items-end justify-between gap-2 sm:flex-row sm:justify-start`}>
          <Legend />
          <div className="weather-panel pointer-events-auto desk:hidden"><StationsToggle className="flex" /></div>
        </div>
        <Timeline status={stationError ?? status} />
      </div>
    </div>
  )
}
