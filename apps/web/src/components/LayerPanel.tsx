import { t } from '../i18n'
import { LAYERS, type LayerId } from '../layers'
import { actions, useStore } from '../timeline/store'

/** Lives in the sidebar on roomy screens and beside the legend on compact ones, where the layer row has no room for it. */
export function StationsToggle({ className }: { className: string }) {
  const showStations = useStore((s) => s.showStations), none = !LAYERS[useStore((s) => s.layer)].stations // the forecast layer has no readings to toggle
  return (
    <label className={`ui-button ui-muted shrink-0 items-center gap-2 px-3 text-base ${none ? 'opacity-35' : ''} ${className}`} title={t(none ? 'stations.none' : 'stations.title')}>
      <input type="checkbox" checked={showStations && !none} disabled={none} onChange={actions.toggleStations} className="accent-sky-400" />
      <span>{t('stations.toggle')}<span className="hidden text-[13px] sm:inline"> · {t('stations.zoomHint')}</span></span>
    </label>
  )
}

export default function LayerPanel() {
  const layer = useStore((s) => s.layer)
  return (
    // A phone upright gets a 4 × 2 grid: seven 44 px targets do not fit its width in one row. On its side the row
    // has room; a roomy screen gets the column.
    <nav aria-label={t('layers.label')} data-pad="layers" className="weather-panel pointer-events-auto flex shrink-0 gap-1 overflow-x-auto p-1 max-sm:grid max-sm:grid-cols-4 desk:w-44 desk:shrink desk:flex-col desk:overflow-y-auto">
      {(Object.keys(LAYERS) as LayerId[]).map((id) => (
        <button key={id} type="button" aria-pressed={layer === id} onClick={() => actions.setLayer(id)} title={t(`layer.${id}.hint`)}
          // The active one keeps its weight so none of them moves.
          className={`ui-button shrink-0 grow px-1.5 py-2 text-center text-[15px] transition-colors sm:px-3 sm:text-base desk:grow-0 desk:text-left ${layer === id ? 'ui-active desk:font-semibold' : 'ui-muted'}`}>
          {t(`layer.${id}`)}
        </button>
      ))}
      <StationsToggle className="hidden desk:mt-1 desk:flex desk:border-t desk:border-[var(--border)]" />
    </nav>
  )
}
