import { useEffect, useState } from 'react'
import { getHistory, getObservations, type Observation, type Readings, type Station } from '../api'
import { useT } from '../i18n'
import { LAYERS } from '../layers'
import { RAMPS, type Variable } from '../ramps'
import { actions, currentFrame, useStore } from '../timeline/store'
import Sparkline from './Sparkline'
import { stationSnapshot } from './chartData'

type Row = Readings & { observedAt: string }
const FIELD: Record<Variable, keyof Readings> = { temperature: 'temperature', humidity: 'humidity', rain: 'rain1h' }

export default function StationCard({ stations }: { stations: Station[] }) {
  const { t, dayTime } = useT()
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
  const points = data.flatMap((r) => { const v = r[FIELD[variable]]; return v == null ? [] : [{ t: Date.parse(r.observedAt), v }] })

  return (
    <aside aria-label={t('station.label', { name: station.name })} className="weather-panel pointer-events-auto max-h-[40dvh] w-full overflow-y-auto p-3 sm:max-h-none sm:w-72 sm:max-w-full">
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
          <div key={k}><dt className="text-slate-400">{k}</dt><dd className="tabular-nums"><span className="text-base font-medium">{v}</span> <span className="text-slate-400">{u}</span></dd></div>
        ))}
      </dl>
      <h3 className="mb-0.5 text-sm text-slate-400">{t('station.chart', { name: t(`var.${variable}`) })}</h3>
      {rows === null ? <p className="ui-muted py-3 text-sm">{t('station.history.loading')}</p> : rows === 'error'
        ? <p className="text-sm text-amber-200">{t('station.history.failed')}<button type="button" className="ui-button px-2 underline" onClick={actions.retry}>{t('retry')}</button></p>
        : <Sparkline points={points} unit={ramp.unit} bars={variable === 'rain'} format={ramp.format} selectedTime={frame?.time} />}
    </aside>
  )
}
