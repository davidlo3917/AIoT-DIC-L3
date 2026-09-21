import { RAMPS, type Variable } from '../ramps'
import { actions, useStore } from '../timeline/store'

const LAYERS: { id: Variable; label: string; hint: string }[] = [
  { id: 'temperature', label: 'Temperature', hint: 'CWA hourly analysis' },
  { id: 'rain', label: 'Rain', hint: 'Radar estimate, past hour' },
  { id: 'humidity', label: 'Humidity', hint: 'Interpolated from stations' },
]

export default function LayerPanel() {
  const variable = useStore((s) => s.variable), showStations = useStore((s) => s.showStations)
  return (
    <nav aria-label="Weather layers" className="pointer-events-auto flex gap-1 overflow-x-auto rounded-xl bg-slate-900/80 p-1 shadow-lg backdrop-blur sm:w-44 sm:flex-col sm:overflow-visible">
      {LAYERS.map((l) => (
        <button key={l.id} type="button" aria-pressed={variable === l.id} onClick={() => actions.setVariable(l.id)} title={l.hint}
          className={`shrink-0 rounded-lg px-2.5 py-2 text-left text-sm sm:px-3 transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${variable === l.id ? 'bg-sky-500/90 font-semibold text-white' : 'text-slate-200 hover:bg-white/10'}`}>
          {l.label}
          <span className="hidden text-xs font-normal opacity-70 sm:block">{l.hint} · {RAMPS[l.id].unit}</span>
        </button>
      ))}
      <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-200 hover:bg-white/10 sm:px-3">
        <input type="checkbox" checked={showStations} onChange={actions.toggleStations} className="accent-sky-400" />
        <span>Stations</span>
      </label>
    </nav>
  )
}
