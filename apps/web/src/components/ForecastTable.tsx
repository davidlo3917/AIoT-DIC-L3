import type { ForecastPeriod } from '../api'
import { monthDay, t, taiwanDay, weekday } from '../i18n'
import { actions } from '../timeline/store'
import { weatherIcon, type ForecastDay } from './chartData'

/** What a card says while its forecast is not there: loading, or failed with Retry; null once it is (`useForecast` in hooks.ts). */
export const forecastStatus = (forecast: ForecastPeriod[] | 'error' | null) =>
  forecast === null ? <p className="ui-muted py-2 text-sm">{t('forecast.loading')}</p>
  : forecast === 'error' ? <p className="py-2 text-sm text-amber-200">{t('forecast.failed')}<button type="button" className="ui-button px-2 underline" onClick={actions.retry}>{t('retry')}</button></p>
  : null

/** A week of CWA's 12-hour periods, a column per day: icon, the high by day and the low by night, and the chance of rain. */
export default function ForecastTable({ week, selectedDay }: { week: ForecastDay[]; selectedDay?: number }) {
  const today = taiwanDay(Date.now()), stressed = selectedDay ?? today
  return (
    <table className="w-full table-fixed border-separate border-spacing-x-0.5 text-center text-sm">
      <colgroup><col className="w-8" />{week.map((d) => <col key={d.noon} />)}</colgroup>
      <thead>
        <tr>
          <td />
          {week.map((d) => (
            <th key={d.noon} scope="col" className="pb-1 font-normal leading-tight">
              <span className={taiwanDay(d.noon) === stressed ? 'font-semibold text-slate-100' : 'text-slate-300'}>
                {taiwanDay(d.noon) === today ? t('forecast.today') : weekday.format(d.noon)}
              </span>
              <span className="block text-xs text-slate-500">{monthDay.format(d.noon)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(['day', 'night'] as const).map((part) => (
          <tr key={part}>
            <th scope="row" className="text-left text-xs font-normal text-slate-400 [writing-mode:vertical-rl]">{t(`forecast.${part}`)}</th>
            {week.map((d) => <ForecastCell key={d.noon} p={d[part]} part={part} />)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** One half-day: an icon, the half's temperature (the high by day, the low by night) and the chance of rain. */
function ForecastCell({ p, part }: { p: ForecastDay['day']; part: 'day' | 'night' }) {
  if (!p) return <td className="text-slate-600">—</td>
  const temp = part === 'day' ? p.max : p.min, wet = (p.rainChance ?? 0) >= 30 // where people start to pack an umbrella
  return (
    <td className={`rounded-md py-1 ${part === 'day' ? 'bg-white/5' : 'bg-white/[0.02]'}`} title={p.weather ?? undefined}>
      <span aria-hidden="true" className="block text-xl leading-tight">{p.weather ? weatherIcon(p.weather, p.start) : '—'}</span>
      <span className="sr-only">{p.weather}</span>
      <span className={`block tabular-nums ${part === 'day' ? 'font-semibold' : 'text-slate-300'}`}>{temp ?? '—'}°</span>
      {p.rainChance != null && (
        <span className={`block text-xs tabular-nums ${wet ? 'font-medium text-sky-300' : 'text-slate-500'}`}>
          <span aria-hidden="true">☂</span><span className="sr-only">{t('forecast.rain')} </span>{p.rainChance}%
        </span>
      )}
    </td>
  )
}
