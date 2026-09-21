import { useEffect, useState } from 'react'
import { getHistory, type Readings, type Station } from '../api'
import { LAYERS } from '../layers'
import { RAMPS, type Variable } from '../ramps'
import { actions, useStore } from '../timeline/store'
import Sparkline from './Sparkline'

type Row = Readings & { observedAt: string }
const FIELD: Record<Variable, keyof Readings> = { temperature: 'temperature', humidity: 'humidity', rain: 'rain1h' }
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** Newest non-null value: a station's weather and rain readings arrive on different timestamps. */
const latest = (rows: Row[], k: keyof Readings) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i][k] != null) return rows[i][k]; return null }

export default function StationCard({ stations }: { stations: Station[] }) {
  const id = useStore((s) => s.selectedStation), variable = LAYERS[useStore((s) => s.layer)].stations
  const station = stations.find((s) => s.id === id)
  const [rows, setRows] = useState<Row[] | 'error' | null>(null)

  useEffect(() => {
    if (!station) return
    setRows(null)
    const ac = new AbortController()
    getHistory(station.cwaStationId, ac.signal).then(setRows, (e) => e.name === 'AbortError' || setRows('error'))
    return () => ac.abort()
  }, [station])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && actions.selectStation(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!station) return null
  const ramp = RAMPS[variable], data = Array.isArray(rows) ? rows : []
  const num = (k: keyof Readings, digits = 1) => { const v = latest(data, k); return v == null ? '—' : v.toFixed(digits) }
  const dir = latest(data, 'windDirection')
  const points = data.flatMap((r) => { const v = r[FIELD[variable]]; return v == null ? [] : [{ t: Date.parse(r.observedAt), v }] })

  return (
    <aside aria-label={`Station ${station.name}`} className="pointer-events-auto w-full rounded-xl bg-slate-900/90 p-3 text-slate-100 shadow-xl backdrop-blur sm:w-72">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{station.name}</h2>
          <p className="truncate text-xs text-slate-400">{[station.county, station.town].filter(Boolean).join(' ')} · {station.elevation ?? '—'} m · {station.cwaStationId}</p>
        </div>
        <button type="button" onClick={() => actions.selectStation(null)} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400">✕</button>
      </header>
      {rows === null && <p className="py-3 text-xs text-slate-400">Loading…</p>}
      {rows === 'error' && <p className="py-3 text-xs text-amber-300">Could not load this station.</p>}
      {Array.isArray(rows) && (
        <>
          <dl className="mb-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
            {[['Temp', num('temperature'), '°C'], ['Humidity', num('humidity', 0), '%'], ['Pressure', num('pressure'), 'hPa'],
              ['Wind', num('windSpeed'), `m/s ${dir == null ? '' : COMPASS[Math.round(dir / 45) % 8]}`], ['Rain 1 h', num('rain1h'), 'mm'], ['Rain 24 h', num('rain24h'), 'mm']].map(([k, v, u]) => (
              <div key={k}><dt className="text-slate-400">{k}</dt><dd className="tabular-nums"><span className="text-sm font-medium">{v}</span> <span className="text-slate-400">{u}</span></dd></div>
            ))}
          </dl>
          <h3 className="mb-0.5 text-xs text-slate-400"><span className="capitalize">{variable}</span>, last 24 h</h3>
          <Sparkline points={points} unit={ramp.unit === 'mm/h' ? 'mm' : ramp.unit} bars={variable === 'rain'} format={ramp.format} />
        </>
      )}
    </aside>
  )
}
