import { useEffect, useState } from 'react'
import { getStations, type Station } from './api'
import LayerPanel from './components/LayerPanel'
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
      <div className="app-chrome pointer-events-none absolute inset-0 flex flex-col gap-3">
        <header className="pr-14"><h1 className="text-base font-semibold tracking-wide drop-shadow">Weather Taiwan</h1><p className="ui-muted text-xs">中央氣象署 · Taiwan weather</p></header>
        {/* Keep the mobile selector clear of the map controls. */}
        <div className="min-w-0 pr-14 sm:self-start sm:pr-0">
          <LayerPanel />
        </div>
        <div className="mt-auto flex min-h-0 flex-col gap-2">
          <div className="min-h-0 sm:absolute sm:right-[76px] sm:top-16"><StationCard key={selectedStation} stations={stations} /></div>
          <div className={`${selectedStation !== null ? 'hidden sm:block' : ''} self-end sm:self-start`}><Legend /></div>
          <Timeline status={stationError ?? status} />
        </div>
      </div>
    </div>
  )
}
