import { useEffect, useState } from 'react'
import { getForecast, getHistory, getObservations, type ForecastPeriod, type Observation, type Readings, type Station } from '../api'
import { useT } from '../i18n'
import { LAYERS } from '../layers'
import { RAMPS, type Variable } from '../ramps'
import { actions, currentFrame, useStore } from '../timeline/store'
import Sparkline from './Sparkline'
import { stationSnapshot, weatherIcon } from './chartData'

type Row = Readings & { observedAt: string }
const FIELD: Record<Variable, keyof Readings> = { temperature: 'temperature', humidity: 'humidity', rain: 'rain1h' }
const MOUNTAIN_M = 1000 // above this a station reads well below its township's forecast (玉山 sits in 信義鄉)

export default function StationCard({ stations }: { stations: Station[] }) {
  const { t, dayTime, period } = useT()
  const id = useStore((s) => s.selectedStation), variable = LAYERS[useStore((s) => s.layer)].stations
  const station = stations.find((s) => s.id === id)
  const [rows, setRows] = useState<Row[] | 'error' | null>(null)
  const frame = useStore(currentFrame), refreshKey = useStore((s) => s.refreshKey)
  const [snapshot, setSnapshot] = useState<{ time: string; value: Observation | null; error?: boolean } | null>(null)

  useEffect(() => {
    if (!station || !frame) return
    let alive = true
    getObservations(frame.time).then(
      (observations) => { if (alive) setSnapshot({ time: frame.time, value: stationSnapshot(observations, station.id) }) },
      () => { if (alive) setSnapshot({ time: frame.time, value: null, error: true }) },
    )
    return () => { alive = false }
  }, [station, frame, refreshKey])

  useEffect(() => {
    if (!station) return
    setRows(null)
    const ac = new AbortController()
    getHistory(station.cwaStationId, ac.signal).then(setRows, (e) => e.name === 'AbortError' || setRows('error'))
    return () => ac.abort()
  }, [station, refreshKey])

  // The township's forecast, not the station's: CWA forecasts per 鄉鎮, and every station names its own.
  const [forecast, setForecast] = useState<ForecastPeriod[] | 'error' | null>(null)
  useEffect(() => {
    if (!station?.county || !station.town) return
    setForecast(null)
    const ac = new AbortController()
    getForecast(station.county, station.town, ac.signal).then(setForecast, (e) => e.name === 'AbortError' || setForecast('error'))
    return () => ac.abort()
  }, [station, refreshKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && actions.selectStation(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!station) return null
  const ramp = RAMPS[variable], data = Array.isArray(rows) ? rows : []
  const current = snapshot?.time === frame?.time ? snapshot : null
  const num = (k: keyof Readings, digits = 1) => { const v = current?.value?.[k]; return v == null ? '—' : v.toFixed(digits) }
  const dir = current?.value?.windDirection, compass = t('compass').split(',')
  const now = Date.now(), upcoming = Array.isArray(forecast) ? forecast.filter((p) => Date.parse(p.end) > now).slice(0, 4) : []
  const points = data.flatMap((r) => { const v = r[FIELD[variable]]; return v == null ? [] : [{ t: Date.parse(r.observedAt), v }] })

  return (
    <aside aria-label={t('station.label', { name: station.name })} className="weather-panel pointer-events-auto max-h-[55dvh] w-full overflow-y-auto p-4 sm:max-h-none sm:w-96 sm:max-w-full">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{station.name}</h2>
          <p className="truncate text-sm text-slate-400">{[station.county, station.town].filter(Boolean).join(' ')} · {station.elevation ?? '—'} m · {station.cwaStationId}</p>
        </div>
        <button type="button" onClick={() => actions.selectStation(null)} aria-label={t('close')} className="ui-button grid shrink-0 place-items-center">✕</button>
      </header>
      <p className="ui-muted mb-2 text-sm">{frame ? t('station.asOf', { time: dayTime.format(new Date(frame.time)) }) : t('station.noTime')}</p>
      {frame && !current && <p className="ui-muted py-2 text-sm" role="status">{t('station.loading')}</p>}
      {current && !current.value && <p className="py-2 text-sm text-amber-200" role="status">{t(current.error ? 'station.failed' : 'station.none')}<button type="button" className="ui-button px-2 underline" onClick={actions.retry}>{t('retry')}</button></p>}
      <dl className="mb-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-sm">
        {[[t('station.temp'), num('temperature'), '°C'], [t('station.humidity'), num('humidity', 0), '%'], [t('station.pressure'), num('pressure'), 'hPa'],
          [t('station.wind'), num('windSpeed'), `m/s ${dir == null ? '' : compass[Math.round(dir / 45) % 8]}`], [t('station.rain1h'), num('rain1h'), 'mm'], [t('station.rain24h'), num('rain24h'), 'mm']].map(([k, v, u]) => (
          <div key={k}><dt className="text-slate-400">{k}</dt><dd className="whitespace-nowrap tabular-nums"><span className="text-base font-medium">{v}</span> <span className="text-slate-400">{u}</span></dd></div>
        ))}
      </dl>
      {station.county && station.town && (
        <section className="mb-3 border-y border-[var(--border)] py-2">
          <h3 className="mb-1.5 text-sm text-slate-400">{t('forecast.title', { town: station.town })}</h3>
          {forecast === null ? <p className="ui-muted py-1 text-sm">{t('forecast.loading')}</p> : forecast === 'error'
            ? <p className="text-sm text-amber-200">{t('forecast.failed')}<button type="button" className="ui-button px-2 underline" onClick={actions.retry}>{t('retry')}</button></p>
            : (
              <ul className="grid grid-cols-4 gap-1.5">
                {upcoming.map((p) => (
                  <li key={p.start} className="flex min-w-0 flex-col items-center rounded-lg bg-white/5 px-1 py-1.5 text-center">
                    <span className="text-[13px] text-slate-400">{period(Date.parse(p.start), now)}</span>
                    <span aria-hidden="true" className="my-0.5 text-2xl leading-none">{p.weather ? weatherIcon(p.weather, p.start) : '—'}</span>
                    <span className="line-clamp-2 text-[13px] leading-tight">{p.weather ?? '—'}</span>
                    <span className="mt-auto pt-1 whitespace-nowrap tabular-nums"><span className="font-semibold">{p.max ?? '—'}°</span> <span className="text-slate-400">{p.min ?? '—'}°</span></span>
                    {/* Worth noticing from 30 % up, where people start to pack an umbrella. */}
                    <span className={`whitespace-nowrap text-[13px] tabular-nums ${(p.rainChance ?? 0) >= 30 ? 'font-medium text-sky-300' : 'text-slate-400'}`} title={t('forecast.rain')}>
                      <span aria-hidden="true">☂ </span><span className="sr-only">{t('forecast.rain')} </span>{p.rainChance == null ? '—' : `${p.rainChance}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          {(station.elevation ?? 0) >= MOUNTAIN_M && <p className="mt-1 text-[13px] text-slate-400">{t('forecast.mountain')}</p>}
        </section>
      )}
      <h3 className="mb-0.5 text-sm text-slate-400">{t('station.chart', { name: t(`var.${variable}`) })}</h3>
      {rows === null ? <p className="ui-muted py-3 text-sm">{t('station.history.loading')}</p> : rows === 'error'
        ? <p className="text-sm text-amber-200">{t('station.history.failed')}<button type="button" className="ui-button px-2 underline" onClick={actions.retry}>{t('retry')}</button></p>
        : <Sparkline points={points} unit={ramp.unit} bars={variable === 'rain'} format={ramp.format} selectedTime={frame?.time} />}
    </aside>
  )
}
