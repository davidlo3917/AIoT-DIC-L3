import { LAYERS } from '../layers'
import { cssGradient, legendPosition } from '../ramps'
import { useStore } from '../timeline/store'

export default function Legend() {
  const layer = useStore((s) => s.layer)
  const { legend: ramp, label: variable, hint } = LAYERS[layer], lo = ramp.stops[0][0], hi = ramp.stops[ramp.stops.length - 1][0]
  return (
    <div className="weather-panel pointer-events-auto w-56 min-w-0 px-4 py-3 text-xs sm:w-72" role="img"
      aria-label={`${variable} scale from ${lo} to ${hi} ${ramp.unit}. ${hint}`}>
      {/* What the layer shows is said here, not under its button, so the layer list never changes height. */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <span>{variable}</span>
        <span className="ui-muted order-last basis-full text-[11px] sm:order-none sm:basis-auto">{hint}</span>
        <span className="ui-muted ml-auto">{ramp.unit}</span>
      </div>
      <div className="h-2.5 rounded-sm" style={{ background: cssGradient(ramp) }} />
      <div className="relative mt-1 h-3.5">
        {ramp.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 tabular-nums opacity-80" style={{ left: `${legendPosition(ramp, t) * 100}%` }}>{t}</span>
        ))}
      </div>
    </div>
  )
}
