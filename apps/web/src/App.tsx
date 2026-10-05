import { useEffect, useState } from 'react'
import { getStations, type Station } from './api'
import LayerPanel, { StationsToggle } from './components/LayerPanel'
import Legend from './components/Legend'
import StationCard from './components/StationCard'
import { useT } from './i18n'
import MapView from './map/MapView'
import { STATUS, type Status } from './status'
import Timeline from './timeline/Timeline'
import { actions, useStore } from './timeline/store'

const OTHER = { 'zh-Hant': { lang: 'en', name: 'English' }, en: { lang: 'zh-Hant', name: '中文' } } as const

/** Named in the language it switches to, so it can be read by exactly the person who needs it. */
function LangSwitch({ className }: { className: string }) {
  const to = OTHER[useStore((s) => s.lang)]
  return (
    <div className={`weather-panel pointer-events-auto shrink-0 ${className}`}>
      <button type="button" lang={to.lang} onClick={() => actions.setLang(to.lang)} className="ui-button px-3 text-xs">{to.name}</button>
    </div>
  )
}

export default function App() {
  const { t, lang } = useT()
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
  // Screen readers and browser translation go by the document's language, not by what the text looks like.
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang, t])

  return (
    <div className="relative h-full w-full overflow-hidden text-slate-100">
      <MapView stations={stations} onStatus={setStatus} />
      {/* Overlay chrome ignores the pointer except on the panels themselves, so the map stays draggable everywhere else. */}
      <div className="app-chrome pointer-events-none absolute inset-0 flex flex-col gap-2">
        {/* A phone on its side keeps about 300 px under the browser's own bars; the title gives way there. */}
        <header className="flex flex-wrap items-center gap-x-2 pr-14 [@media(max-height:359px)]:hidden">
          <h1 className="text-base font-semibold tracking-wide drop-shadow">{t('app.title')}</h1>
          <p className="ui-muted order-last basis-full text-xs sm:order-none sm:basis-auto">{t('app.source')}</p>
          <LangSwitch className="ml-auto" />
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
          {/* Where the header is hidden, the language switch moves down here. */}
          <LangSwitch className="hidden [@media(max-height:359px)]:block" />
        </div>
        <Timeline status={stationError ? STATUS.stationsFailed : status} />
      </div>
    </div>
  )
}
