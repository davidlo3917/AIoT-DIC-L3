import { useState } from 'react'
import { shortDayTime, t } from '../i18n'
import { warningColor } from '../map/layers/warnings'
import { useStore } from '../timeline/store'

/** The county advisories in force, in the map's colours; one opens to its counties and CWA's text. Nothing is shown when there are none. */
export default function Warnings() {
  const warnings = useStore((s) => s.warnings)
  const [open, setOpen] = useState<number | null>(null)
  if (!warnings.length) return null
  return (
    <section aria-label={t('warnings.title')} className="weather-panel pointer-events-auto shrink-0 p-1 text-sm">
      <div className="ui-muted px-2 pt-1 text-[13px]">{t('warnings.title')} · {t('warnings.hint')}</div>
      {warnings.map((w, i) => (
        <div key={i}>
          <button type="button" className="ui-button block w-full px-2 py-1.5 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: warningColor(w.phenomena) }} aria-hidden="true" />
            <span className="font-semibold">{w.phenomena}{w.significance}</span>
            <span className="ui-muted block text-[13px]">{t('warnings.summary', { n: w.counties.length, until: shortDayTime.format(new Date(w.end)) })}</span>
          </button>
          {open === i && (
            <div className="px-2 pb-2 text-[13px]">
              <p>{w.counties.join('、')}</p>
              {w.text && <p className="ui-muted mt-1 whitespace-pre-line">{w.text}</p>}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
