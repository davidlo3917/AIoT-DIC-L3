// Colour scales. These follow meteorological convention rather than a generic sequential palette, because
// that is what people who read weather maps already know:
//  - temperature: the cold-blue → warm-red scale used by Windy / CWA;
//  - rain: CWA's own stepped QPE scale, which Taiwanese readers recognise from TV forecasts;
//  - humidity: a single-hue sequential ramp (no convention to honour, so the plain rule applies).
export type Ramp = { unit: string; stops: [number, string][]; stepped?: boolean; ticks: number[]; format: (v: number) => string }

export const RAMPS = {
  temperature: {
    unit: '°C', ticks: [0, 10, 20, 30],
    format: (v) => v.toFixed(1),
    stops: [[-10, '#8e7cc3'], [0, '#4a90d9'], [10, '#4fc3c7'], [18, '#7fd36b'], [24, '#f2e04c'], [29, '#f59a3a'], [34, '#e0453a'], [39, '#a0226b']],
  },
  humidity: {
    unit: '%', ticks: [40, 60, 80, 100],
    format: (v) => v.toFixed(0),
    stops: [[30, '#f1f5d8'], [50, '#a8dcc6'], [70, '#4fb3c9'], [85, '#2b7bb8'], [100, '#1f3f94']],
  },
  rain: {
    unit: 'mm', stepped: true, ticks: [1, 10, 30, 70, 130, 300],
    format: (v) => v.toFixed(1),
    stops: [[1, '#9cfcff'], [2, '#03c8ff'], [6, '#059bff'], [10, '#0363ff'], [15, '#059902'], [20, '#39ff03'], [30, '#fffb03'], [40, '#ffc800'],
      [50, '#ff9500'], [70, '#ff0000'], [90, '#cc0000'], [110, '#990000'], [130, '#960099'], [150, '#c900cc'], [200, '#fb00ff'], [300, '#fdc9ff']],
  },
} satisfies Record<string, Ramp>

export type Variable = keyof typeof RAMPS

// Read off CWA's own radar PNG (58 distinct colours, one per dBZ): cyan→blue to 14, greens to 25, yellow at 30,
// orange by 40, reds to 50, magenta beyond. Used for the legend only — the image itself is drawn as published.
export const RADAR_RAMP: Ramp = {
  unit: 'dBZ', ticks: [0, 15, 30, 45, 60], format: (v) => v.toFixed(0),
  stops: [[0, '#00ffff'], [14, '#0000ff'], [15, '#00ff00'], [25, '#009600'], [30, '#ffff00'], [40, '#ff9600'], [41, '#ff0000'], [50, '#960000'], [51, '#ff00ff'], [65, '#9600ff']],
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

/** value → [r, g, b, a]. Below the first stop of a stepped ramp (e.g. rain < 1 mm) is transparent. */
export function colorOf(ramp: Ramp, v: number): [number, number, number, number] {
  const s = ramp.stops
  if (ramp.stepped) {
    if (v < s[0][0]) return [0, 0, 0, 0]
    let i = s.length - 1
    while (s[i][0] > v) i--
    return [...rgb(s[i][1]), 255]
  }
  if (v <= s[0][0]) return [...rgb(s[0][1]), 255]
  for (let i = 1; i < s.length; i++) {
    if (v > s[i][0]) continue
    const t = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]), a = rgb(s[i - 1][1]), b = rgb(s[i][1])
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255]
  }
  return [...rgb(s[s.length - 1][1]), 255]
}

/** Same ramp as a MapLibre expression, so station dots and the raster surface can never disagree. */
export const mapExpression = (ramp: Ramp, property: string) =>
  [ramp.stepped ? 'step' : 'interpolate', ...(ramp.stepped ? [] : [['linear']]), ['get', property],
    ...(ramp.stepped ? ['rgba(0,0,0,0)'] : []), ...ramp.stops.flatMap(([v, c]) => [v, c])]

/**
 * Legend geometry. Continuous ramps sit on a linear axis. Stepped ramps get equal-width bins instead: CWA's rain
 * thresholds run 1 → 300 mm, and a linear axis would squeeze every everyday value into the first few pixels.
 */
export const legendPosition = (ramp: Ramp, v: number) => {
  const s = ramp.stops
  if (!ramp.stepped) return (v - s[0][0]) / (s[s.length - 1][0] - s[0][0])
  return s.findIndex(([t]) => t === v) / s.length // a tick sits at the left edge of the bin it opens
}

export const cssGradient = (ramp: Ramp) => {
  const s = ramp.stops, pct = (f: number) => (f * 100).toFixed(2) + '%'
  if (ramp.stepped) return `linear-gradient(to right, ${s.map(([, c], i) => `${c} ${pct(i / s.length)} ${pct((i + 1) / s.length)}`).join(', ')})`
  return `linear-gradient(to right, ${s.map(([v, c]) => `${c} ${pct(legendPosition(ramp, v))}`).join(', ')})`
}
