import { LAYERS, type LayerId } from '../layers'
import { actions, useStore } from '../timeline/store'

/** Lives in the sidebar on roomy screens and beside the legend on compact ones, where the layer row has no room for it. */
export function StationsToggle({ className }: { className: string }) {
  const showStations = useStore((s) => s.showStations)
  return (
    <label className={`ui-button ui-muted shrink-0 items-center gap-2 px-3 text-sm ${className}`} title="Visible when zoomed in">
      <input type="checkbox" checked={showStations} onChange={actions.toggleStations} className="accent-sky-400" />
      <span>Stations<span className="hidden text-[11px] sm:inline"> · zoom in</span></span>
    </label>
  )
}

export default function LayerPanel() {
  const layer = useStore((s) => s.layer)
  return (
    <nav aria-label="Weather layers" className="weather-panel pointer-events-auto flex gap-1 overflow-x-auto p-1 desk:w-44 desk:flex-col desk:overflow-y-auto">
      {(Object.keys(LAYERS) as LayerId[]).map((id) => (
        <button key={id} type="button" aria-pressed={layer === id} onClick={() => actions.setLayer(id)} title={LAYERS[id].hint}
          // Compact row: four buttons share a phone's width (tight enough for 360 px in English), and the active one
          // keeps its weight so none of them moves.
          className={`ui-button shrink-0 grow px-1.5 py-2 text-center text-[13px] transition-colors sm:px-3 sm:text-sm desk:grow-0 desk:text-left ${layer === id ? 'ui-active desk:font-semibold' : 'ui-muted'}`}>
          {LAYERS[id].label}
        </button>
      ))}
      <StationsToggle className="hidden desk:mt-1 desk:flex desk:border-t desk:border-[var(--border)]" />
    </nav>
  )
}
