import { useEffect, useState } from 'react'
import { dataAge, weekdayTime } from '../format'
import { LAYERS } from '../layers'
import { shortcut } from './shortcut'
import { actions, currentFrame, useStore } from './store'

// Always Taiwan time: the data is about Taiwan, wherever the viewer's laptop thinks it is.
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short' })
const dayTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const SPEEDS = [0.5, 1, 2, 4]

// Stepping has a bar, playing does not: "▶" twice in a row said nothing about which was which.
const ICONS = { prev: 'M6 5h2v14H6zM20 5v14L9 12z', play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z', next: 'M16 5h2v14h-2zM4 5v14l11-7z' }
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d={d} /></svg>

export default function Timeline({ status }: { status: string | null }) {
  const frames = useStore((s) => s.frames), index = useStore((s) => s.index), playing = useStore((s) => s.playing), speed = useStore((s) => s.speed)
  const frame = useStore(currentFrame)
  const loadState = useStore((s) => s.loadState), followLatest = useStore((s) => s.followLatest)
  const message = loadState === 'error' ? 'Could not refresh the timeline' : status
  const canRetry = loadState === 'error' || loadState === 'empty' || (!!status && !status.startsWith('Loading'))

  const { everyMin } = LAYERS[useStore((s) => s.layer)], every = everyMin === 60 ? 'hour' : `${everyMin} min`

  // The frame's age is measured against a clock that ticks, so a tab left open does not keep saying "8 min ago".
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30e3)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let tabbed = false // true while the keyboard, not the pointer, is what moves the focus
    // Capture phase: MapLibre pans on arrow keys from a bubble-phase listener on its canvas, and must not see ours.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') tabbed = true
      const target = e.target instanceof HTMLElement ? e.target : null
      const action = shortcut(e, target, tabbed && !!target?.classList.contains('maplibregl-canvas'))
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      if (action === 'toggle') actions.toggle()
      else actions.step(action === 'prev' ? -1 : 1)
    }
    const onPointer = () => { tabbed = false }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPointer, true) }
  }, [])

  // Playback itself is driven from useWeather, which knows when a frame is actually on the map.
  const last = frames.length - 1, following = followLatest && index === last
  // How far back the slider reaches, counted from now: hourly data arrives an hour late, so its 23 or 24 frames are
  // still "the past 24 h". Never more than the 24 h the API serves, however stale the list is.
  const hours = frames[0] ? Math.min(24, Math.ceil((now - Date.parse(frames[0].time)) / 3600e3)) : 0
  // A young layer has little to play; say so, or a Play button that is disabled (or done in one step) looks broken.
  const history = frames.length > 5 ? `Past ${hours} h · every ${every}`
    : frames.length > 1 ? `${frames.length} frames so far — history is still building, one more every ${every}`
    : frames.length === 1 ? `Only one frame so far, so nothing to play yet — a new one arrives every ${every}`
    : loadState === 'loading' ? 'Loading timeline…' : loadState === 'empty' ? 'No frames available yet' : 'Timeline unavailable'
  const btn = 'ui-button grid h-11 w-11 place-items-center'
  return (
    <section aria-label="Timeline" className="weather-panel pointer-events-auto px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={btn} onClick={() => actions.step(-1)} disabled={index <= 0} aria-label="Previous frame" title="Previous frame (←)" aria-keyshortcuts="ArrowLeft"><Icon d={ICONS.prev} /></button>
        <button type="button" className={`${btn} ui-active`} onClick={actions.toggle} disabled={last < 1} title={last < 1 ? history : `${playing ? 'Pause' : 'Play'} (Space)`} aria-label={playing ? 'Pause' : 'Play'} aria-keyshortcuts="Space"><Icon d={playing ? ICONS.pause : ICONS.play} /></button>
        <button type="button" className={btn} onClick={() => actions.step(1)} disabled={index >= last} aria-label="Next frame" title="Next frame (→)" aria-keyshortcuts="ArrowRight"><Icon d={ICONS.next} /></button>
        <div className="order-first min-w-0 basis-full pb-1 sm:order-none sm:ml-3 sm:basis-auto sm:flex-1 sm:pb-0">
          <div className="flex items-baseline gap-2">
            <time className="whitespace-nowrap text-sm font-semibold tabular-nums" dateTime={frame?.time}>
              {frame ? <><span className="hidden sm:inline">{weekday.format(new Date(frame.time))} </span>{dayTime.format(new Date(frame.time))}</> : '—'}
            </time>
            <span className="ui-muted text-[11px]">UTC+8</span>
            {frame && <span className="ui-muted truncate text-[11px]">· {dataAge(Date.parse(frame.time), now)}</span>}
          </div>
        </div>
        {/* One control for "am I seeing now?": lit while following the newest data, the way back otherwise. */}
        <button type="button" className={`ui-button ml-auto px-3 text-xs ${following && frame ? 'ui-active' : 'bg-slate-800/60'}`} onClick={actions.latest} disabled={!frames.length}
          title={following ? 'Showing the newest data as it arrives' : 'Jump to the newest data and keep following it'}>
          {following ? <><span aria-hidden="true" className={frame ? 'text-emerald-400' : undefined}>● </span>Live</> : 'Back to latest'}
        </button>
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
        <span>{frames[0] ? weekdayTime.format(new Date(frames[0].time)) : ''}</span>
        <span className={frames.length > 0 && frames.length <= 5 ? 'px-2 text-center text-amber-300' : undefined}>{history}</span>
        <span>{frames[last] ? weekdayTime.format(new Date(frames[last].time)) : ''}</span>
      </div>
    </section>
  )
}
