import { dayTime, t } from '../i18n'
import { cycloneName } from '../map/layers/typhoon'
import { actions, useStore } from '../timeline/store'

/** Active tropical cyclones, which are usually off-screen: a tap flies to the track. Nothing is shown when there are none. */
export default function Typhoons() {
  const cyclones = useStore((s) => s.typhoons)
  if (!cyclones.length) return null
  return (
    <section aria-label={t('typhoon.title')} className="weather-panel pointer-events-auto shrink-0 p-1 text-sm">
      <div className="ui-muted px-2 pt-1 text-[13px]">{t('typhoon.title')} · {t('typhoon.hint')}</div>
      {cyclones.map((c, i) => {
        const now = c.analysis.at(-1)
        return (
          <button key={i} type="button" className="ui-button block w-full px-2 py-1.5 text-left" onClick={() => actions.focusTyphoon(i)}>
            <span className="font-semibold">{cycloneName(c)}</span>
            {c.cwaName && c.name && <span className="ui-muted"> {c.name}</span>}
            {now && <span className="ui-muted block text-[13px]">{t('typhoon.stats', { time: dayTime.format(new Date(now.time)), pressure: now.pressure ?? '—', wind: now.wind ?? '—' })}</span>}
          </button>
        )
      })}
    </section>
  )
}
