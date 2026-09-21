import { LAYERS, type LayerId } from '../layers'
import { actions, useStore } from '../timeline/store'

export default function LayerPanel() {
  const layer = useStore((s) => s.layer), showStations = useStore((s) => s.showStations)
  return (
    <nav aria-label="Weather layers" className="pointer-events-auto flex gap-1 overflow-x-auto rounded-xl bg-slate-900/80 p-1 shadow-lg backdrop-blur sm:w-44 sm:flex-col sm:overflow-visible">
      {(Object.keys(LAYERS) as LayerId[]).map((id) => (
        <button key={id} type="button" aria-pressed={layer === id} onClick={() => actions.setLayer(id)} title={LAYERS[id].hint}
          className={`shrink-0 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 sm:px-3 ${layer === id ? 'bg-sky-500/90 font-semibold text-white' : 'text-slate-200 hover:bg-white/10'}`}>
          {LAYERS[id].label}
          <span className="hidden text-xs font-normal opacity-70 sm:block">{LAYERS[id].hint} · {LAYERS[id].legend.unit}</span>
        </button>
      ))}
      <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-200 hover:bg-white/10 sm:px-3">
        <input type="checkbox" checked={showStations} onChange={actions.toggleStations} className="accent-sky-400" />
        <span>Stations</span>
      </label>
    </nav>
  )
}
