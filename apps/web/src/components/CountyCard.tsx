import { useMemo } from 'react'
import type { Station } from '../api'
import { t, taiwanDay } from '../i18n'
import { COUNTIES, countyTowns } from '../map/layers/forecast'
import { actions, currentFrame, useStore } from '../timeline/store'
import { dayExtremes, upcomingWeek } from './chartData'
import ForecastTable, { forecastStatus } from './ForecastTable'
import { useEscape, useForecast } from './hooks'
import WeekChart from './WeekChart'

const closeCounty = () => actions.selectCounty(null)

/** The forecast layer's card: a county picked from the list or on the map, its week as a high/low chart and the day/night table. */
export default function CountyCard({ stations }: { stations: Station[] }) {
  const county = useStore((s) => s.selectedCounty), frame = useStore(currentFrame)
  const towns = useMemo(() => countyTowns(stations), [stations]), town = county ? towns[county] : undefined // the township the map colours the county by
  const forecast = useForecast(county, town)
  useEscape(closeCounty)

  if (!county) return null
  const week = Array.isArray(forecast) ? upcomingWeek(forecast, Date.now()) : []
  const days = week.flatMap((d) => { const x = dayExtremes([d.day, d.night]); return x ? [{ noon: d.noon, ...x }] : [] })
  const selectedDay = frame ? taiwanDay(Date.parse(frame.time)) : undefined
  return (
    <aside aria-label={t('county.label', { county })} className="weather-panel pointer-events-auto max-h-[55dvh] w-full overflow-y-auto p-4 sm:max-h-none sm:w-[26rem] sm:max-w-full">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <select aria-label={t('county.select')} value={county} onChange={(e) => actions.selectCounty(e.target.value)} className="ui-button bg-slate-800/60 px-2 text-lg font-semibold">
            {COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1 truncate text-sm text-slate-400">{town && t('county.rep', { town })}</p>
        </div>
        <button type="button" onClick={closeCounty} aria-label={t('close')} className="ui-button grid shrink-0 place-items-center">✕</button>
      </header>
      {forecastStatus(forecast) ?? <>
        <h3 className="mb-0.5 text-sm text-slate-400">{t('county.chart')}</h3>
        <WeekChart days={days} selectedDay={selectedDay} />
        <div className="mt-3 border-t border-[var(--border)] pt-2"><ForecastTable week={week} selectedDay={selectedDay} /></div>
      </>}
    </aside>
  )
}
