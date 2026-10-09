import { useEffect, useState } from 'react'
import { PLAYBACK_DAYS } from '../api'
import { age, dayTime, fullTime, shortDayTime, t } from '../i18n'
import { LAYERS } from '../layers'
import { STATUS, type Status } from '../status'
import { shortcut } from './shortcut'
import { actions, currentFrame, useStore } from './store'

const SPEEDS = [0.5, 1, 2, 4]

// Stepping has a bar, playing does not: "▶" twice in a row said nothing about which was which.
const ICONS = { prev: 'M6 5h2v14H6zM20 5v14L9 12z', play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z', next: 'M16 5h2v14h-2zM4 5v14l11-7z' }
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d={d} /></svg>

export default function Timeline({ status }: { status: Status }) {
  const frames = useStore((s) => s.frames), index = useStore((s) => s.index), playing = useStore((s) => s.playing), speed = useStore((s) => s.speed)
  const frame = useStore(currentFrame)
  const loadState = useStore((s) => s.loadState), followLatest = useStore((s) => s.followLatest)
  // A failed refresh outranks whatever the map reports; an empty timeline speaks only when nothing else does.
  const shown: Status = loadState === 'error' ? STATUS.timelineError : status ?? (loadState === 'empty' ? STATUS.empty : null)

  const { everyMin } = LAYERS[useStore((s) => s.layer)], every = t(`every.${everyMin}`)

  // The frame's age is measured against a clock that ticks, so a tab left open does not keep saying "8 minutes ago".
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
  // How far back the slider reaches, counted from now: in days once it spans more than a day and a half (rounded, as
  // the window starts on the hour), in hours before that, while a layer's history is still building up.
  const span = frames[0] ? now - Date.parse(frames[0].time) : 0
  const reach = span > 36 * 3600e3 ? t('timeline.days', { days: Math.min(PLAYBACK_DAYS, Math.round(span / 86400e3)) }) : t('timeline.hours', { hours: Math.ceil(span / 3600e3) })
  // A young layer has little to play; say so, or a Play button that is disabled (or done in one step) looks broken.
  const history = frames.length > 5 ? t('timeline.past', { reach, every })
    : frames.length > 1 ? t('timeline.few', { n: frames.length, every })
    : frames.length === 1 ? t('timeline.one', { every })
    : t(loadState === 'loading' ? 'timeline.loading' : loadState === 'empty' ? 'timeline.none' : 'timeline.unavailable')
  const btn = 'ui-button grid h-11 w-11 place-items-center'
  const at = (time: string) => new Date(time)
  return (
    <section aria-label={t('timeline.label')} data-pad="timeline" className="weather-panel pointer-events-auto px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={btn} onClick={() => actions.step(-1)} disabled={index <= 0} aria-label={t('timeline.prev')} title={`${t('timeline.prev')} (←)`} aria-keyshortcuts="ArrowLeft"><Icon d={ICONS.prev} /></button>
        <button type="button" className={`${btn} ui-active`} onClick={actions.toggle} disabled={last < 1} aria-label={t(playing ? 'timeline.pause' : 'timeline.play')}
          title={last < 1 ? history : `${t(playing ? 'timeline.pause' : 'timeline.play')} (${t('key.space')})`} aria-keyshortcuts="Space"><Icon d={playing ? ICONS.pause : ICONS.play} /></button>
        <button type="button" className={btn} onClick={() => actions.step(1)} disabled={index >= last} aria-label={t('timeline.next')} title={`${t('timeline.next')} (→)`} aria-keyshortcuts="ArrowRight"><Icon d={ICONS.next} /></button>
        <div className="order-first min-w-0 basis-full pb-1 sm:order-none sm:ml-3 sm:basis-auto sm:flex-1 sm:pb-0">
          <div className="flex items-baseline gap-2">
            <time className="whitespace-nowrap text-base font-semibold tabular-nums" dateTime={frame?.time}>
              {frame ? <><span className="sm:hidden">{dayTime.format(at(frame.time))}</span><span className="hidden sm:inline">{fullTime.format(at(frame.time))}</span></> : '—'}
            </time>
            <span className="ui-muted text-[13px]">UTC+8</span>
            {frame && <span className="ui-muted truncate text-[13px]">· {age(Date.parse(frame.time), now)}</span>}
          </div>
        </div>
        {/* One control for "am I seeing now?": lit while following the newest data, the way back otherwise. */}
        <button type="button" className={`ui-button ml-auto px-3 text-sm ${following && frame ? 'ui-active' : 'bg-slate-800/60'}`} onClick={actions.latest} disabled={!frames.length}
          title={t(following ? 'timeline.live.title' : 'timeline.latest.title')}>
          {following ? <><span aria-hidden="true" className={frame ? 'text-emerald-400' : undefined}>● </span>{t('timeline.live')}</> : t('timeline.latest')}
        </button>
        <label className="ui-muted flex items-center gap-1 text-sm">
          <span className="hidden sm:inline">{t('timeline.speed')}</span>
          <select aria-label={t('timeline.speed.label')} value={speed} onChange={(e) => actions.setSpeed(Number(e.target.value))} className="ui-button bg-slate-800/60 px-2">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
      </div>
      {shown && <div className="flex items-center justify-between gap-2 text-sm text-amber-200" role="status">
        <span>{t(shown.key)}</span>
        {shown.action && <button type="button" className="ui-button shrink-0 px-3 underline" onClick={shown.action.run}>{t(shown.action.key)}</button>}
      </div>}
      <input type="range" min={0} max={Math.max(0, last)} value={Math.max(0, index)} onChange={(e) => actions.seek(Number(e.target.value))} disabled={last < 1}
        aria-label={t('timeline.time')} aria-valuetext={frame ? fullTime.format(at(frame.time)) : undefined} className="block h-11 w-full" />
      <div className="flex justify-between gap-2 text-[13px] tabular-nums text-slate-400">
        {/* Dates, not weekdays: a week back is the same weekday as today. */}
        <span className="whitespace-nowrap">{frames[0] ? shortDayTime.format(at(frames[0].time)) : ''}</span>
        <span className={frames.length > 0 && frames.length <= 5 ? 'px-2 text-center text-amber-300' : undefined}>{history}</span>
        <span className="whitespace-nowrap">{frames[last] ? shortDayTime.format(at(frames[last].time)) : ''}</span>
      </div>
    </section>
  )
}
