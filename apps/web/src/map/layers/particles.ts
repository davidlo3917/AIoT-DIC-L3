import type { Map as MapLibreMap } from 'maplibre-gl'
import { latOfMercY, mercY, type WindField } from './grid'

// Wind particles: short white streaks carried by the field, on a 2D canvas laid over the map. They live in screen
// space (a pixel position and an age), read u/v at their position from the current field, and fade through the
// canvas's own alpha each frame, which draws the trails for free. While the map moves they pause and the canvas
// clears, so nothing is drawn in the wrong place; they reseed when it settles.
// ponytail: a DOM canvas above everything the map draws, labels included; a MapLibre CustomLayerInterface is the
// upgrade if the labels must sit above the streaks.
const DENSITY = 1 / 900 // particles per screen pixel
const MAX = 2500
const FADE = 0.93 // alpha kept per frame: longer trails at higher values
const SPEED = 0.09 // screen px per frame per m/s — ponytail: the same at every zoom; scale with zoom if it reads wrong close in
const MAX_AGE = 90 // frames, so a streak never loops forever in a calm or circles an eddy

/** Starts drawing from whatever `field()` returns (null draws nothing). Returns the function that stops and removes it. */
export function startParticles(map: MapLibreMap, field: () => WindField | null) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {} // the coloured speed surface still shows the wind
  const canvas = document.createElement('canvas')
  canvas.className = 'pointer-events-none absolute inset-0 h-full w-full'
  canvas.setAttribute('aria-hidden', 'true')
  const container = map.getContainer()
  container.insertBefore(canvas, container.querySelector('.maplibregl-control-container')) // above the map, below its buttons
  const ctx = canvas.getContext('2d')!
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  let W = 0, H = 0, count = 0, xs = new Float32Array(0), ys = new Float32Array(0), ages = new Uint16Array(0)
  let view = { west: 0, east: 0, yTop: 0, yBottom: 0 }, paused = false, raf = 0

  const spawn = (i: number) => { xs[i] = Math.random() * W; ys[i] = Math.random() * H; ages[i] = Math.floor(Math.random() * MAX_AGE) }
  const settle = () => { // the map's view (never rotated or pitched: MapView disables both), and a fresh set of particles
    W = container.clientWidth
    H = container.clientHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const b = map.getBounds()
    view = { west: b.getWest(), east: b.getEast(), yTop: mercY(b.getNorth()), yBottom: mercY(b.getSouth()) }
    count = Math.min(MAX, Math.round(W * H * DENSITY))
    xs = new Float32Array(count); ys = new Float32Array(count); ages = new Uint16Array(count)
    for (let i = 0; i < count; i++) spawn(i)
    paused = false
  }
  const pause = () => { paused = true; ctx.clearRect(0, 0, canvas.width, canvas.height) }

  const step = () => {
    raf = requestAnimationFrame(step)
    const f = field()
    if (!f || paused) return
    ctx.globalCompositeOperation = 'destination-in' // keep FADE of what is there: the trails
    ctx.fillStyle = `rgba(0,0,0,${FADE})`
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1.2 * dpr
    ctx.beginPath()
    const [fw, fs, fe, fn] = f.bounds
    for (let i = 0; i < count; i++) {
      if (++ages[i] > MAX_AGE) { spawn(i); ages[i] = 0; continue }
      const x = xs[i], y = ys[i]
      const lon = view.west + (x / W) * (view.east - view.west), lat = latOfMercY(view.yTop + (y / H) * (view.yBottom - view.yTop))
      const col = ((lon - fw) / (fe - fw)) * f.width, row = ((fn - lat) / (fn - fs)) * f.height
      if (col < 0 || row < 0 || col >= f.width || row >= f.height) { spawn(i); continue }
      const k = Math.floor(row) * f.width + Math.floor(col), u = f.u[k], v = f.v[k]
      if (Number.isNaN(u)) { spawn(i); continue }
      const nx = x + u * SPEED, ny = y - v * SPEED // v is northward, the screen's y points down
      ctx.moveTo(x * dpr, y * dpr)
      ctx.lineTo(nx * dpr, ny * dpr)
      xs[i] = nx
      ys[i] = ny
    }
    ctx.stroke()
  }

  settle()
  map.on('movestart', pause)
  map.on('moveend', settle)
  map.on('resize', settle)
  raf = requestAnimationFrame(step)
  return () => {
    cancelAnimationFrame(raf)
    map.off('movestart', pause)
    map.off('moveend', settle)
    map.off('resize', settle)
    canvas.remove()
  }
}
