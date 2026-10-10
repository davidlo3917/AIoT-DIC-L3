import { t, taiwanDay, weekday } from '../i18n'

type Day = { noon: number; max: number; min: number }
const W = 384, H = 130, PAD = { l: 16, r: 16, t: 16, b: 30 }
const HIGH = '#f87171', LOW = '#38bdf8' // red for the high, blue for the low, as every forecast chart has it

/** The week's highs and lows as two lines, every value printed (seven points need no tooltip) with a halo so the map's day, the dashed line, never crosses a number. */
export default function WeekChart({ days, selectedDay }: { days: Day[]; selectedDay?: number }) {
  if (days.length < 2) return <p className="py-3 text-sm text-slate-400">{t('county.short')}</p>
  const max = Math.max(...days.map((d) => d.max)), min = Math.min(...days.map((d) => d.min)), hi = max + 1, lo = min - 1
  const x = (i: number) => PAD.l + (i / (days.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const line = (key: 'max' | 'min') => days.map((d, i) => `${x(i)},${y(d[key])}`).join(' ')
  const selected = days.findIndex((d) => taiwanDay(d.noon) === selectedDay)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label={t('county.chartLabel', { max, min })}>
        {selected >= 0 && <line x1={x(selected)} x2={x(selected)} y1={PAD.t - 8} y2={H - PAD.b + 4} stroke="#e5edf7" strokeWidth="1.5" strokeDasharray="3 2"><title>{t('chart.selected')}</title></line>}
        <polyline fill="none" stroke={HIGH} strokeWidth="2" strokeLinejoin="round" points={line('max')} />
        <polyline fill="none" stroke={LOW} strokeWidth="2" strokeLinejoin="round" points={line('min')} />
        {days.map((d, i) => (
          <g key={d.noon} className="text-[11px] tabular-nums" paintOrder="stroke" stroke="var(--panel)" strokeWidth="3">
            <circle cx={x(i)} cy={y(d.max)} r="3" fill={HIGH} stroke="none" />
            <text x={x(i)} y={y(d.max) - 6} textAnchor="middle" className="fill-slate-100">{d.max}°</text>
            <circle cx={x(i)} cy={y(d.min)} r="3" fill={LOW} stroke="none" />
            <text x={x(i)} y={y(d.min) + 14} textAnchor="middle" className="fill-slate-300">{d.min}°</text>
            <text x={x(i)} y={H - 4} textAnchor="middle" className="fill-slate-400">{weekday.format(d.noon)}</text>
          </g>
        ))}
      </svg>
      <p className="flex gap-3 text-[13px] text-slate-400" aria-hidden="true">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: HIGH }} />{t('county.max')}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: LOW }} />{t('county.min')}</span>
      </p>
    </div>
  )
}
