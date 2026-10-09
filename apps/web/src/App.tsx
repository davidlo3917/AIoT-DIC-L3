import { useEffect, useState } from 'react'
import { getStations, type Station } from './api'
import LayerPanel, { StationsToggle } from './components/LayerPanel'
import Legend from './components/Legend'
import StationCard from './components/StationCard'
import Typhoons from './components/Typhoons'
import Warnings from './components/Warnings'
import { t } from './i18n'
import MapView from './map/MapView'
import { STATUS, type Status } from './status'
import Timeline from './timeline/Timeline'
import { useStore } from './timeline/store'

/** What is in force right now (advisories, typhoons): nothing when there is nothing. The group scrolls; the panels keep their size. */
const Alerts = ({ className }: { className: string }) => (
  <div data-pad="alerts" className={`${className} pointer-events-auto min-h-0 flex-col gap-2 overflow-y-auto`}><Warnings /><Typhoons /></div>
)

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
              layer list, so the station card on the other side can reach down to the timeline. The alerts go under
              the layer row on compact screens and top-right, above the station card, on roomy ones. */}
          <div className="flex min-h-0 min-w-0 flex-col gap-2 pr-14 sm:pr-0 desk:shrink-0">
            <LayerPanel />
            {/* A phone on its side has no room for them under the layer row; the outlines on the map still show. */}
            <Alerts className="flex sm:max-w-sm desk:hidden [@media(max-height:399px)]:hidden" />
            <div className="mt-auto hidden desk:block"><Legend /></div>
          </div>
          <div className="mt-auto flex min-h-0 min-w-0 flex-col gap-2 sm:mr-16 sm:mt-0 sm:ml-auto">
            {/* An open station card has the column: the card needs its full height at 1280×800, and the outlines stay on the map. */}
            <Alerts className={`${selectedStation !== null ? 'hidden' : 'hidden desk:flex'} desk:w-72 desk:self-end`} />
            <div className="mt-auto flex min-h-0 flex-col"><StationCard key={selectedStation} stations={stations} /></div>
          </div>
        </div>
        {/* Compact layouts only; it makes way for an open station card. */}
        <div data-pad="legend" className={`${selectedStation !== null ? 'hidden' : 'flex'} flex-row-reverse items-end justify-between gap-2 sm:flex-row sm:justify-start desk:hidden`}>
          <Legend />
          <div className="weather-panel pointer-events-auto desk:hidden"><StationsToggle className="flex" /></div>
        </div>
        <Timeline status={stationError ? STATUS.stationsFailed : status} />
      </div>
    </div>
  )
}
