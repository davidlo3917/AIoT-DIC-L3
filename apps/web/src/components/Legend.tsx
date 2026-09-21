import { cssGradient, legendPosition, RAMPS } from '../ramps'
import { useStore } from '../timeline/store'

export default function Legend() {
  const variable = useStore((s) => s.variable)
  const ramp = RAMPS[variable], lo = ramp.stops[0][0], hi = ramp.stops[ramp.stops.length - 1][0]
  return (
    <div className="pointer-events-auto w-56 rounded-xl bg-slate-900/80 p-2.5 text-xs text-slate-200 shadow-lg backdrop-blur" role="img"
      aria-label={`${variable} scale from ${lo} to ${hi} ${ramp.unit}`}>
      <div className="mb-1 flex justify-between"><span className="capitalize">{variable}</span><span className="opacity-70">{ramp.unit}</span></div>
      <div className="h-2.5 rounded-sm" style={{ background: cssGradient(ramp) }} />
      <div className="relative mt-1 h-3.5">
        {ramp.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 tabular-nums opacity-80" style={{ left: `${legendPosition(ramp, t) * 100}%` }}>{t}</span>
        ))}
      </div>
    </div>
  )
}
