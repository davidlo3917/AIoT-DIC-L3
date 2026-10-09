import { useEffect, useState } from 'react'
import { getStations, type Station } from './api'
import LayerPanel, { StationsToggle } from './components/LayerPanel'
import Legend from './components/Legend'
import StationCard from './components/StationCard'
import Typhoons from './components/Typhoons'
import { t } from './i18n'
import MapView from './map/MapView'
import { STATUS, type Status } from './status'
import Timeline from './timeline/Timeline'
import { useStore } from './timeline/store'

export default function App() {
  const [status, setStatus] = useState<Status>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [stationError, setStationError] = useState(false)
  const refreshKey = useStore((s) => s.refreshKey)
  const selectedStation = useStore((s) => s.selectedStation)
  useEffect(() => {
    let alive = true
    setStationError(false)
    getStations().then((rows) => { if (alive) setStations(rows) }, () => { if (alive) setStationError(true) })
    return () => { alive = false }
  }, [refreshKey])

  return (
    <div className="relative h-full w-full overflow-hidden text-slate-100">
      <MapView stations={stations} onStatus={setStatus} />
      {/* Overlay chrome ignores the pointer except on the panels themselves, so the map stays draggable everywhere else. */}
      <div className="app-chrome pointer-events-none absolute inset-0 flex flex-col gap-2">
        {/* A phone on its side keeps about 300 px under the browser's own bars; the title gives way there. On phones the
            title sits on a translucent chip: zoomed out, offshore station values (馬祖) pass right under it. */}
        <header className="flex flex-wrap items-center gap-x-2 self-start rounded-lg bg-[#0b1220cc] px-2.5 py-1.5 sm:self-auto sm:bg-transparent sm:p-0 sm:pr-14 [@media(max-height:359px)]:hidden">
          <h1 className="text-lg font-semibold tracking-wide drop-shadow">{t('app.title')}</h1>
          <p className="ui-muted order-last basis-full text-sm sm:order-none sm:basis-auto">{t('app.source')}</p>
        </header>
        {/* The one region that gives: its panels shrink and scroll, so the legend and timeline below never leave the screen. */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row">
          {/* pr-14 keeps the phone's layer row clear of the map controls. On roomy screens the legend sits under the
              layer list, so the station card on the other side can reach down to the timeline. */}
          <div className="flex min-h-0 min-w-0 shrink-0 flex-col pr-14 sm:pr-0">
            <LayerPanel />
            <Typhoons />
            <div className="mt-auto hidden pt-2 desk:block"><Legend /></div>
          </div>
          <div className="mt-auto flex min-h-0 min-w-0 flex-col sm:mr-16 sm:mt-0 sm:ml-auto"><StationCard key={selectedStation} stations={stations} /></div>
        </div>
        {/* Compact layouts only; it makes way for an open station card. */}
        <div className={`${selectedStation !== null ? 'hidden' : 'flex'} flex-row-reverse items-end justify-between gap-2 sm:flex-row sm:justify-start desk:hidden`}>
          <Legend />
          <div className="weather-panel pointer-events-auto desk:hidden"><StationsToggle className="flex" /></div>
        </div>
        <Timeline status={stationError ? STATUS.stationsFailed : status} />
      </div>
    </div>
  )
}
