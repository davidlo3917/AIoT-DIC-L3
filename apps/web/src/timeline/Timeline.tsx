import { LAYERS } from '../layers'
import { actions, currentFrame, useStore } from './store'

// Always Taiwan time: the data is about Taiwan, wherever the viewer's laptop thinks it is.
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short' })
const dayTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })
const SPEEDS = [0.5, 1, 2, 4]

export default function Timeline({ status }: { status: string | null }) {
  const frames = useStore((s) => s.frames), index = useStore((s) => s.index), playing = useStore((s) => s.playing), speed = useStore((s) => s.speed)
  const frame = useStore(currentFrame)

  const every = LAYERS[useStore((s) => s.layer)].every

  // Playback itself is driven from useWeather, which knows when a frame is actually on the map.
  const last = frames.length - 1, isLatest = index === last
  // A young layer has little to play; say so, or a Play button that is disabled (or done in one step) looks broken.
  const history = frames.length > 5 ? `${frames.length} frames`
    : frames.length > 1 ? `${frames.length} frames so far — history is still building, one more every ${every}`
    : frames.length === 1 ? `Only one frame so far, so nothing to play yet — a new one arrives every ${every}`
    : 'Loading…'
  const btn = 'grid h-9 w-9 place-items-center rounded-lg text-slate-100 hover:bg-white/10 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-sky-400'
  return (
    <section aria-label="Timeline" className="pointer-events-auto rounded-xl bg-slate-900/80 px-3 py-2 text-slate-100 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1">
        <button type="button" className={btn} onClick={() => actions.step(-1)} disabled={index <= 0} aria-label="Previous frame">◀</button>
        <button type="button" className={`${btn} bg-sky-500/90 hover:bg-sky-400`} onClick={actions.toggle} disabled={last < 1} title={last < 1 ? history : undefined} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" className={btn} onClick={() => actions.step(1)} disabled={index >= last} aria-label="Next frame">▶</button>
        <div className="ml-2 min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <time className="whitespace-nowrap text-sm font-semibold tabular-nums" dateTime={frame?.time}>
              {frame ? <><span className="hidden sm:inline">{weekday.format(new Date(frame.time))} </span>{dayTime.format(new Date(frame.time))}</> : '—'}
            </time>
            {frame && isLatest && <span className="rounded bg-emerald-500/20 px-1.5 text-[11px] font-medium text-emerald-300">Latest</span>}
            {status && <span role="status" className="truncate text-xs text-amber-300">{status}</span>}
          </div>
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-300">
          <span className="hidden sm:inline">Speed</span>
          <select value={speed} onChange={(e) => actions.setSpeed(Number(e.target.value))} className="rounded bg-slate-800 px-1 py-1 text-slate-100">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
      </div>
      <input type="range" min={0} max={Math.max(0, last)} value={Math.max(0, index)} onChange={(e) => actions.seek(Number(e.target.value))} disabled={last < 1}
        aria-label="Time" aria-valuetext={frame ? fmt.format(new Date(frame.time)) : undefined} className="mt-1 w-full accent-sky-400" />
      <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
        <span>{frames[0] ? hhmm.format(new Date(frames[0].time)) : ''}</span>
        <span className={frames.length > 0 && frames.length <= 5 ? 'px-2 text-center text-amber-300' : undefined}>{history}</span>
        <span>{frames[last] ? hhmm.format(new Date(frames[last].time)) : ''}</span>
      </div>
    </section>
  )
}
