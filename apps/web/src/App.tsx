import { useEffect, useState } from 'react'
import { getStations, type Station } from './api'
import LayerPanel from './components/LayerPanel'
import Legend from './components/Legend'
import StationCard from './components/StationCard'
import MapView from './map/MapView'
import Timeline from './timeline/Timeline'

export default function App() {
  const [status, setStatus] = useState<string | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  useEffect(() => { getStations().then(setStations, () => {}) }, [])

  return (
    <div className="relative h-full w-full overflow-hidden text-slate-100">
      <MapView stations={stations} onStatus={setStatus} />
      {/* Overlay chrome ignores the pointer except on the panels themselves, so the map stays draggable everywhere else. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 sm:p-3">
        <h1 className="text-lg font-semibold drop-shadow">Weather Taiwan</h1>
        {/* pr-12 / mr-12: keep clear of the map's zoom + attribution buttons in the top-right corner */}
        <div className="flex flex-col gap-2 pr-12 sm:flex-row sm:items-start sm:justify-between sm:pr-0">
          <LayerPanel />
          <div className="-mr-12 sm:mr-12"><StationCard stations={stations} /></div>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <div className="self-end sm:self-start"><Legend /></div>
          <Timeline status={status} />
        </div>
      </div>
    </div>
  )
}
