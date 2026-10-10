import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { getForecast, type ForecastPeriod, type Frame, type Station } from '../../api'
import { weekExtremes } from '../../components/chartData'
import { taiwanDay, taiwanMidnight } from '../../i18n'
import { mapExpression, RAMPS } from '../../ramps'
import type { Counties } from './warnings'

const SOURCE = 'forecast', FILL = 'forecast-fill', LINE = 'forecast-line', SELECTED = 'forecast-selected'
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

/** CWA's 22 counties, north to south and then the islands, spelled as the API's county list spells them (臺, not 台). */
export const COUNTIES = ['基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣']

/** Seven daily frames from today (Taiwan), each at its midnight, so "latest" is today whatever the hour. */
export function forecastFrames(now = Date.now()): Frame[] {
  const today = taiwanDay(now)
  return Array.from({ length: 7 }, (_, i) => ({ time: new Date(taiwanMidnight(today + i)).toISOString() }))
}

/**
 * The township whose forecast stands for each county: its lowest station's, so a town on the plain rather than the
 * peak above it (嘉義縣 reads as 東石鄉, not 阿里山鄉).
 * ponytail: a lowland township stands for the county; CWA's county-level forecast dataset is the upgrade if the official county number ever matters
 */
export function countyTowns(stations: Station[]): Record<string, string> {
  const towns: Record<string, string> = {}, height: Record<string, number> = {}
  for (const s of stations) {
    if (!s.county || !s.town) continue
    const h = s.elevation ?? Infinity
    if (!(s.county in towns) || h < height[s.county]) { towns[s.county] = s.town; height[s.county] = h }
  }
  return towns
}

/** Every county's week, fetched in parallel (22 CDN-cached township forecasts); a county whose fetch failed is left out, and only all of them failing rejects. */
export async function countyForecasts(stations: Station[]): Promise<Map<string, ForecastPeriod[]>> {
  const towns = countyTowns(stations)
  const results = await Promise.allSettled(COUNTIES.map((c) => towns[c] ? getForecast(c, towns[c]) : Promise.reject(new Error(`${c}: no station`))))
  const out = new Map<string, ForecastPeriod[]>()
  results.forEach((r, i) => { if (r.status === 'fulfilled') out.set(COUNTIES[i], r.value) })
  if (!out.size) throw new Error('forecast unavailable')
  return out
}

/**
 * Every county for one frame's day: coloured by the average of the day's high and low where the week (the same week
 * the card shows, as of `now`) has that day, and drawn without a value where it does not, so it is still there to tap.
 */
export function countyFeatures(counties: Counties, forecasts: Map<string, ForecastPeriod[]>, time: string, now = Date.now()) {
  const day = taiwanDay(Date.parse(time))
  return { type: 'FeatureCollection' as const, features: counties.features.map((f) => {
    const periods = forecasts.get(f.properties.name), x = periods && weekExtremes(periods, now).get(day)
    return { ...f, properties: x ? { name: f.properties.name, max: x.max, min: x.min, avg: (x.max + x.min) / 2 } : { name: f.properties.name } }
  }) }
}

export function addForecastLayers(map: MapLibreMap, before: string, onSelect: (county: string) => void) {
  map.addSource(SOURCE, { type: 'geojson', data: EMPTY })
  // The same ramp as the temperature layer, so a forecast day reads like an observed one; the basemap shows through.
  // A county without a number for the day is grey: still a county, still tappable, visibly not a temperature.
  map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': ['case', ['has', 'avg'], mapExpression(RAMPS.temperature, 'avg'), '#475569'] as never, 'fill-opacity': 0.8 } }, before)
  map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': '#0b1220', 'line-width': 1 } }, before)
  map.addLayer({ id: SELECTED, type: 'line', source: SOURCE, filter: ['==', ['get', 'name'], ''], layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 3 } }, before)
  const click = (e: MapMouseEvent) => {
    const feature = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0]
    if (feature) onSelect(feature.properties.name)
  }
  const enter = () => { map.getCanvas().style.cursor = 'pointer' }
  const leave = () => { map.getCanvas().style.cursor = '' }
  map.on('click', click)
  map.on('mouseenter', FILL, enter)
  map.on('mouseleave', FILL, leave)
  return () => {
    map.off('click', click)
    map.off('mouseenter', FILL, enter)
    map.off('mouseleave', FILL, leave)
    for (const id of [SELECTED, LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

/** `null` clears the map: another layer is up, or the day could not be fetched. */
export function updateForecast(map: MapLibreMap, data: ReturnType<typeof countyFeatures> | null) {
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData((data ?? EMPTY) as never)
}

export function setForecastSelection(map: MapLibreMap, county: string | null) {
  if (map.getLayer(SELECTED)) map.setFilter(SELECTED, ['==', ['get', 'name'], county ?? ''])
}
