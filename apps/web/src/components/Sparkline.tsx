import { useState } from 'react'
import { chartExtent } from './chartData'

type Point = { t: number; v: number }
const W = 260, H = 72, PAD = { l: 4, r: 4, t: 8, b: 14 }
const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })

/** One series, so no legend: the card title names it. 2px line, recessive axis, crosshair + tooltip on hover/touch. */
export default function Sparkline({ points, unit, bars, format, selectedTime }: { points: Point[]; unit: string; bars?: boolean; format: (v: number) => string; selectedTime?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <p className="py-3 text-xs text-slate-400">Not enough history yet — a new reading arrives every 10 minutes.</p>

  const t0 = points[0].t, t1 = points[points.length - 1].t
  const { min, max, low: lo, high: hi } = chartExtent(points, bars)
  const selected = selectedTime ? Date.parse(selectedTime) : NaN
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const nearest = (clientX: number, rect: DOMRect) => {
    const t = t0 + ((((clientX - rect.left) / rect.width) * W - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0)
    return points.reduce((best, p, i) => (Math.abs(p.t - t) < Math.abs(points[best].t - t) ? i : best), 0)
  }
  const h = hover == null ? null : points[hover]
  const barW = Math.max(1.5, ((W - PAD.l - PAD.r) / points.length) * 0.7)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img"
        aria-label={`Last 24 hours, ${format(min)} to ${format(max)} ${unit}${selectedTime ? `; map time ${hhmm.format(selected)}` : ''}`}
        onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="currentColor" className="text-slate-600" strokeWidth="1" />
        {bars
          ? points.map((p, i) => <rect key={i} x={x(p.t) - barW / 2} width={barW} y={y(p.v)} height={Math.max(0, H - PAD.b - y(p.v))} rx="1" className="fill-sky-400" opacity={hover == null || hover === i ? 1 : 0.45} />)
          : <polyline fill="none" className="stroke-sky-400" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} />}
        {h && <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t - 4} y2={H - PAD.b} stroke="currentColor" className="text-slate-400" strokeWidth="1" strokeDasharray="2 2" />}
        {h && !bars && <circle cx={x(h.t)} cy={y(h.v)} r="4" className="fill-sky-400 stroke-slate-900" strokeWidth="2" />}
        {selected >= t0 && selected <= t1 && <line x1={x(selected)} x2={x(selected)} y1={PAD.t - 4} y2={H - PAD.b} stroke="#e5edf7" strokeWidth="1.5" strokeDasharray="3 2"><title>Selected map time</title></line>}
        <text x={PAD.l} y={H - 2} className="fill-slate-400 text-[9px]">{hhmm.format(t0)}</text>
        <text x={W - PAD.r} y={H - 2} textAnchor="end" className="fill-slate-400 text-[9px]">{hhmm.format(t1)}</text>
      </svg>
      <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
        <span>min {format(min)} · max {format(max)} {unit}</span>
        <span className="text-slate-100">{h ? `${hhmm.format(h.t)} · ${format(h.v)} ${unit}` : ' '}</span>
      </div>
    </div>
  )
}
