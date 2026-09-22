import { LAYERS, type LayerId } from '../layers'
import { actions, useStore } from '../timeline/store'

export default function LayerPanel() {
  const layer = useStore((s) => s.layer), showStations = useStore((s) => s.showStations)
  return (
    <nav aria-label="Weather layers" className="weather-panel pointer-events-auto flex gap-1 overflow-x-auto p-1 sm:w-44 sm:flex-col sm:overflow-visible">
      {(Object.keys(LAYERS) as LayerId[]).map((id) => (
        <button key={id} type="button" aria-pressed={layer === id} onClick={() => actions.setLayer(id)} title={LAYERS[id].hint}
          className={`ui-button shrink-0 px-3 py-2 text-left text-sm transition-colors ${layer === id ? 'ui-active font-semibold' : 'ui-muted'}`}>
          {LAYERS[id].label}
          {layer === id && <span className="mt-1 hidden text-xs font-normal opacity-80 sm:block">{LAYERS[id].hint} · {LAYERS[id].legend.unit}</span>}
        </button>
      ))}
      <label className="ui-button ui-muted flex shrink-0 items-center gap-2 px-3 py-2 text-sm sm:mt-1 sm:border-t sm:border-[var(--border)]">
        <input type="checkbox" checked={showStations} onChange={actions.toggleStations} className="accent-sky-400" />
        <span>Stations<span className="hidden text-[11px] sm:block">Visible when zoomed in</span></span>
      </label>
    </nav>
  )
}
