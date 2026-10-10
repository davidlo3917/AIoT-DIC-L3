import { useEffect, useState } from 'react'
import { getHistory, getObservations, type Observation, type Readings, type Station } from '../api'
import { dayTime, t } from '../i18n'
import { LAYERS } from '../layers'
import { FIELD } from '../map/layers/stations'
import { RAMPS } from '../ramps'
import { actions, currentFrame, useStore } from '../timeline/store'
import ForecastTable, { forecastStatus } from './ForecastTable'
import Sparkline from './Sparkline'
import { upcomingWeek } from './chartData'
import { useEscape, useForecast } from './hooks'

type Row = Readings & { observedAt: string }
const MOUNTAIN_M = 1000 // above this a station reads well below its township's forecast (玉山 sits in 信義鄉)
const DAY = 86400e3
const closeStation = () => actions.selectStation(null)

export default function StationCard({ stations }: { stations: Station[] }) {
  const id = useStore((s) => s.selectedStation), variable = LAYERS[useStore((s) => s.layer)].stations
  const station = stations.find((s) => s.id === id)
  const [rows, setRows] = useState<Row[] | 'error' | null>(null)
  const frame = useStore(currentFrame), refreshKey = useStore((s) => s.refreshKey)
  const [snapshot, setSnapshot] = useState<{ time: string; value: Observation | null; error?: boolean } | null>(null)

  // Effects key on the station's ids, not the object: a refreshed station list must not fetch everything twice.
  useEffect(() => {
    if (!station || !frame) return
    let alive = true
    getObservations(frame.time).then(
      (observations) => { if (alive) setSnapshot({ time: frame.time, value: observations.find((o) => o.stationId === station.id) ?? null }) },
      () => { if (alive) setSnapshot({ time: frame.time, value: null, error: true }) },
    )
    return () => { alive = false }
  }, [station?.id, frame, refreshKey])

  useEffect(() => {
    if (!station) return
    setRows(null)
    const ac = new AbortController()
    getHistory(station.cwaStationId, ac.signal).then(setRows, (e) => e.name === 'AbortError' || setRows('error'))
    return () => ac.abort()
  }, [station?.cwaStationId, refreshKey])

  // The township's forecast, not the station's: CWA forecasts per 鄉鎮, and every station names its own.
  const forecast = useForecast(station?.county, station?.town)
  useEscape(closeStation)

  if (!station || !variable) return null // no readings to show on a layer without a station variable (the forecast)
  const ramp = RAMPS[variable], data = Array.isArray(rows) ? rows : []
  // The previous readings stay up until the next ones replace them: blanking them on every playback step flickered
  // the whole card. The time line names the readings shown, so the two always agree.
  const current = frame ? snapshot : null
  const num = (k: keyof Readings, digits = 1) => { const v = current?.value?.[k]; return v == null ? '—' : v.toFixed(digits) }
  const dir = current?.value?.windDirection, compass = t('compass').split(',')
  const now = Date.now()
  const week = Array.isArray(forecast) ? upcomingWeek(forecast, now) : []
  // The chart shows the 24 h around the map time out of the week fetched: the last 24 h while following now,
  // centred on the map time when it is further back, so its dashed line is always on the chart.
  const end = Math.min(now, (frame ? Date.parse(frame.time) : now) + DAY / 2), start = end - DAY
  const points = data.flatMap((r) => {
    const at = Date.parse(r.observedAt), v = r[FIELD[variable]]
    return v == null || at < start || at > end ? [] : [{ t: at, v }]
  })
  return (
    <aside aria-label={t('station.label', { name: station.name })} className="weather-panel pointer-events-auto max-h-[55dvh] w-full overflow-y-auto p-4 sm:max-h-none sm:w-[26rem] sm:max-w-full">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{station.name}</h2>
          <p className="truncate text-sm text-slate-400">{[station.county, station.town].filter(Boolean).join(' ')} · {station.elevation ?? '—'} m · {station.cwaStationId}</p>
        </div>
        <button type="button" onClick={() => actions.selectStation(null)} aria-label={t('close')} className="ui-button grid shrink-0 place-items-center">✕</button>
      </header>
      <p className="ui-muted mb-2 text-sm">{frame ? t('station.asOf', { time: dayTime.format(new Date(current?.time ?? frame.time)) }) : t('station.noTime')}</p>
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
          {forecastStatus(forecast) ?? <ForecastTable week={week} />}
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

