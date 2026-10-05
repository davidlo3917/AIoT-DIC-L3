import { useStore } from './timeline/store'

export type Lang = 'zh-Hant' | 'en'

// Every sentence a person can read or a screen reader can speak. Layer, variable and interval keys are built by
// convention (`layer.<id>`, `layer.<id>.hint`, `var.<variable>`, `every.<minutes>`), which the type check still covers.
export const en = {
  'app.title': 'Weather Taiwan',
  'app.source': 'Data: Central Weather Administration (CWA)',
  retry: 'Retry',
  close: 'Close',

  'layers.label': 'Weather layers',
  'layer.temperature': 'Temperature', 'layer.temperature.hint': 'Air temperature, hourly',
  'layer.rain': 'Rain', 'layer.rain.hint': 'Rain in the past hour',
  'layer.radar': 'Radar', 'layer.radar.hint': 'Where it is raining now',
  'layer.humidity': 'Humidity', 'layer.humidity.hint': 'Estimated between stations',
  'legend.label': '{name} scale from {lo} to {hi} {unit}. {hint}',
  'stations.toggle': 'Stations', 'stations.zoomHint': 'zoom in', 'stations.title': 'Visible when zoomed in',

  'timeline.label': 'Timeline',
  'timeline.prev': 'Previous frame', 'timeline.next': 'Next frame', 'timeline.play': 'Play', 'timeline.pause': 'Pause',
  'key.space': 'Space',
  'timeline.live': 'Live', 'timeline.live.title': 'Showing the newest data as it arrives',
  'timeline.latest': 'Back to latest', 'timeline.latest.title': 'Jump to the newest data and keep following it',
  'timeline.speed': 'Speed', 'timeline.speed.label': 'Playback speed', 'timeline.time': 'Time',
  'every.10': 'every 10 min', 'every.60': 'every hour',
  'timeline.past': 'Past {hours} h · {every}',
  'timeline.few': '{n} frames so far — history is still building, one more {every}',
  'timeline.one': 'Only one frame so far, so nothing to play yet — a new one arrives {every}',
  'timeline.loading': 'Loading timeline…', 'timeline.none': 'No frames available yet', 'timeline.unavailable': 'Timeline unavailable',
  'age.now': 'just now',

  'status.loadingMap': 'Loading map…',
  'status.loadingWeather': 'Loading weather…',
  'status.timelineError': 'Could not refresh the timeline',
  'status.empty': 'New data will appear as it becomes available.',
  'status.noData': 'No data for this time',
  'status.noHumidity': 'Humidity is not available yet',
  'status.noStationReadings': 'No station readings for this time',
  'status.stationReadingsFailed': 'Could not load station readings',
  'status.stationsFailed': 'Could not load the station list',

  'station.label': '{name} station',
  'station.asOf': 'As of {time} · UTC+8', 'station.noTime': 'Select a map time',
  'station.loading': 'Loading readings…', 'station.failed': 'Could not load readings.', 'station.none': 'No readings for this time.',
  'station.temp': 'Temp', 'station.humidity': 'Humidity', 'station.pressure': 'Pressure',
  'station.wind': 'Wind', 'station.rain1h': 'Rain 1 h', 'station.rain24h': 'Rain 24 h',
  compass: 'N,NE,E,SE,S,SW,W,NW', // eight points, clockwise from north
  'var.temperature': 'Temperature', 'var.humidity': 'Humidity', 'var.rain': 'Rain',
  'station.chart': '{name}, last 24 h · dashed line: map time',
  'station.history.loading': 'Loading history…', 'station.history.failed': 'Could not load history.',
  'chart.short': 'Not enough history yet — a new reading arrives every 10 minutes.',
  'chart.label': 'Last 24 hours, {min} to {max} {unit}', 'chart.mapTime': '; map time {time}',
  'chart.selected': 'Selected map time', 'chart.range': 'min {min} · max {max} {unit}',

  'map.title': 'Map', 'map.zoomIn': 'Zoom in', 'map.zoomOut': 'Zoom out', 'map.attribution': 'Map credits',
}
export type Key = keyof typeof en

/** Typed against `en`: a missing or misspelt key fails the type check. Station and town names are CWA's and stay Chinese. */
export const zh: Record<Key, string> = {
  'app.title': '臺灣天氣',
  'app.source': '資料來源：中央氣象署',
  retry: '重試',
  close: '關閉',

  'layers.label': '天氣圖層',
  'layer.temperature': '溫度', 'layer.temperature.hint': '氣溫，每小時更新',
  'layer.rain': '雨量', 'layer.rain.hint': '過去 1 小時累積雨量',
  'layer.radar': '雷達', 'layer.radar.hint': '目前哪裡在下雨',
  'layer.humidity': '濕度', 'layer.humidity.hint': '由測站資料推估',
  'legend.label': '{name}色階，{lo} 到 {hi} {unit}。{hint}',
  'stations.toggle': '測站', 'stations.zoomHint': '放大顯示', 'stations.title': '放大地圖後才會顯示',

  'timeline.label': '時間軸',
  'timeline.prev': '上一個時間', 'timeline.next': '下一個時間', 'timeline.play': '播放', 'timeline.pause': '暫停',
  'key.space': '空白鍵',
  'timeline.live': '即時', 'timeline.live.title': '有新資料時自動顯示',
  'timeline.latest': '回到最新', 'timeline.latest.title': '跳到最新資料並持續更新',
  'timeline.speed': '速度', 'timeline.speed.label': '播放速度', 'timeline.time': '時間',
  'every.10': '每 10 分鐘', 'every.60': '每小時',
  'timeline.past': '過去 {hours} 小時 · {every}更新',
  'timeline.few': '目前只有 {n} 筆資料，還在累積中，{every}新增一筆',
  'timeline.one': '目前只有一筆資料，還無法播放；{every}會有新資料',
  'timeline.loading': '載入時間軸中…', 'timeline.none': '目前還沒有資料', 'timeline.unavailable': '無法取得時間軸',
  'age.now': '剛剛',

  'status.loadingMap': '載入地圖中…',
  'status.loadingWeather': '載入天氣資料中…',
  'status.timelineError': '無法更新時間軸',
  'status.empty': '有新資料時會自動顯示。',
  'status.noData': '這個時間沒有資料',
  'status.noHumidity': '目前還沒有濕度資料',
  'status.noStationReadings': '這個時間沒有測站資料',
  'status.stationReadingsFailed': '無法載入測站資料',
  'status.stationsFailed': '無法載入測站清單',

  'station.label': '{name}測站',
  'station.asOf': '觀測時間 {time} · UTC+8', 'station.noTime': '請先選擇時間',
  'station.loading': '載入觀測資料中…', 'station.failed': '無法載入觀測資料。', 'station.none': '這個時間沒有觀測資料。',
  'station.temp': '氣溫', 'station.humidity': '濕度', 'station.pressure': '氣壓',
  'station.wind': '風', 'station.rain1h': '1 小時雨量', 'station.rain24h': '24 小時雨量',
  compass: '北,東北,東,東南,南,西南,西,西北',
  'var.temperature': '氣溫', 'var.humidity': '濕度', 'var.rain': '雨量',
  'station.chart': '{name}，過去 24 小時 · 虛線為地圖時間',
  'station.history.loading': '載入歷史資料中…', 'station.history.failed': '無法載入歷史資料。',
  'chart.short': '歷史資料還不夠，每 10 分鐘會有一筆新資料。',
  'chart.label': '過去 24 小時，{min} 到 {max} {unit}', 'chart.mapTime': '；地圖時間 {time}',
  'chart.selected': '地圖時間', 'chart.range': '最低 {min} · 最高 {max} {unit}',

  'map.title': '地圖', 'map.zoomIn': '放大', 'map.zoomOut': '縮小', 'map.attribution': '地圖資料來源',
}

const DICT = { 'zh-Hant': zh, en }
const LOCALE = { 'zh-Hant': 'zh-TW', en: 'en-GB' }
type Params = Record<string, string | number>

/** Fills `{name}` placeholders. One left unfilled stays visible, so a forgotten parameter is noticed rather than silently blank. */
export const translate = (lang: Lang, key: Key, params: Params = {}) =>
  DICT[lang][key].replace(/\{(\w+)\}/g, (hole, name: string) => name in params ? String(params[name]) : hole)

function bind(lang: Lang) {
  // Always Taiwan time: the data is about Taiwan, wherever the viewer's laptop thinks it is.
  // h23: midnight is 00:00 (zh-TW prints 24:00 with `hour12: false`).
  const clock = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: 'Asia/Taipei', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', ...o })
  const ago = new Intl.RelativeTimeFormat(LOCALE[lang])
  const t = (key: Key, params?: Params) => translate(lang, key, params)
  return {
    lang, t,
    time: clock({}), // 13:50
    weekdayTime: clock({ weekday: 'short' }), // Sun 13:50 — the ends of a 24 h range, where a bare time does not say which day
    dayTime: clock({ day: 'numeric', month: 'short' }), // 5 Oct, 13:50
    fullTime: clock({ weekday: 'short', day: 'numeric', month: 'short' }), // Mon 5 Oct, 13:50
    /** How old a frame is: minutes up to an hour and a half, hours beyond. A viewer's clock running behind must not read as "in 3 minutes". */
    age(time: number, now: number) {
      const min = Math.round((now - time) / 60e3)
      return min <= 0 ? t('age.now') : min < 90 ? ago.format(-min, 'minute') : ago.format(-Math.round(min / 60), 'hour')
    },
  }
}

// Built once per language, so `t` and the formatters keep their identity across renders.
export const I18N = { 'zh-Hant': bind('zh-Hant'), en: bind('en') }
export const useT = () => I18N[useStore((s) => s.lang)]
