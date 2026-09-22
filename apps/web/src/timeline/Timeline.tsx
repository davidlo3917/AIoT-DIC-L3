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
  const loadState = useStore((s) => s.loadState), followLatest = useStore((s) => s.followLatest)
  const message = loadState === 'error' ? 'Could not refresh the timeline' : status
  const canRetry = loadState === 'error' || loadState === 'empty' || (!!status && !status.startsWith('Loading'))

  const every = LAYERS[useStore((s) => s.layer)].every

  // Playback itself is driven from useWeather, which knows when a frame is actually on the map.
  const last = frames.length - 1, isLatest = index === last
  // A young layer has little to play; say so, or a Play button that is disabled (or done in one step) looks broken.
  const history = frames.length > 5 ? `${frames.length} frames`
    : frames.length > 1 ? `${frames.length} frames so far — history is still building, one more every ${every}`
    : frames.length === 1 ? `Only one frame so far, so nothing to play yet — a new one arrives every ${every}`
    : loadState === 'loading' ? 'Loading timeline…' : loadState === 'empty' ? 'No frames available yet' : 'Timeline unavailable'
  const btn = 'ui-button grid h-11 w-11 place-items-center'
  return (
    <section aria-label="Timeline" className="weather-panel pointer-events-auto px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={btn} onClick={() => actions.step(-1)} disabled={index <= 0} aria-label="Previous frame">◀</button>
        <button type="button" className={`${btn} ui-active`} onClick={actions.toggle} disabled={last < 1} title={last < 1 ? history : undefined} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" className={btn} onClick={() => actions.step(1)} disabled={index >= last} aria-label="Next frame">▶</button>
        <div className="order-first min-w-0 basis-full pb-1 sm:order-none sm:ml-3 sm:basis-auto sm:flex-1 sm:pb-0">
          <div className="flex items-baseline gap-2">
            <time className="whitespace-nowrap text-sm font-semibold tabular-nums" dateTime={frame?.time}>
              {frame ? <><span className="hidden sm:inline">{weekday.format(new Date(frame.time))} </span>{dayTime.format(new Date(frame.time))}</> : '—'}
            </time>
            <span className="ui-muted text-[11px]">UTC+8</span>
            {frame && isLatest && followLatest && <span className="rounded bg-blue-400/10 px-1.5 text-[11px] text-blue-200">Following latest</span>}
          </div>
        </div>
        <button type="button" className={`ui-button ml-auto px-3 text-xs ${followLatest ? 'ui-active' : ''}`} onClick={actions.latest} disabled={!frames.length} aria-pressed={followLatest}>Latest</button>
        <label className="ui-muted flex items-center gap-1 text-xs">
          <span className="hidden sm:inline">Speed</span>
          <select aria-label="Playback speed" value={speed} onChange={(e) => actions.setSpeed(Number(e.target.value))} className="ui-button bg-slate-800/60 px-2">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
      </div>
      {(message || canRetry) && <div className="flex items-center justify-between gap-2 text-xs text-amber-200" role="status">
        <span>{message ?? 'New data will appear as it becomes available.'}</span>
        {canRetry && <button type="button" className="ui-button shrink-0 px-3 underline" onClick={actions.retry}>Retry</button>}
      </div>}
      <input type="range" min={0} max={Math.max(0, last)} value={Math.max(0, index)} onChange={(e) => actions.seek(Number(e.target.value))} disabled={last < 1}
        aria-label="Time" aria-valuetext={frame ? fmt.format(new Date(frame.time)) : undefined} className="block h-11 w-full" />
      <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
        <span>{frames[0] ? hhmm.format(new Date(frames[0].time)) : ''}</span>
        <span className={frames.length > 0 && frames.length <= 5 ? 'px-2 text-center text-amber-300' : undefined}>{history}</span>
        <span>{frames[last] ? hhmm.format(new Date(frames[last].time)) : ''}</span>
      </div>
    </section>
  )
}
