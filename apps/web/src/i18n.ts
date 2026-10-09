// Every sentence a person can read or a screen reader can speak, in Taiwan Mandarin. Layer, variable and interval keys are
// built by convention (`layer.<id>`, `layer.<id>.hint`, `var.<variable>`, `every.<minutes>`), which the type check still covers.
export const zh = {
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
  'stations.toggle': '測站', 'stations.zoomHint': '放大看更多', 'stations.title': '縮小時只顯示主要測站，放大地圖可看到更多',

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

export type Key = keyof typeof zh
type Params = Record<string, string | number>

/** Fills `{name}` placeholders. One left unfilled stays visible, so a forgotten parameter is noticed rather than silently blank. */
export const translate = (key: Key, params: Params = {}) =>
  zh[key].replace(/\{(\w+)\}/g, (hole, name: string) => name in params ? String(params[name]) : hole)

// Always Taiwan time: the data is about Taiwan, wherever the viewer's laptop thinks it is.
// h23: midnight is 00:00 (zh-TW prints 24:00 with `hour12: false`).
const clock = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', ...o })
const ago = new Intl.RelativeTimeFormat('zh-TW')

// ponytail: Chinese only (the English switch was removed); `useT` stays so call sites did not change.
export const I18N = {
  t: translate,
  time: clock({}), // 13:50
  weekdayTime: clock({ weekday: 'short' }), // 週一 13:50 — the ends of a 24 h range, where a bare time does not say which day
  dayTime: clock({ day: 'numeric', month: 'short' }), // 10月5日 13:50
  fullTime: clock({ weekday: 'short', day: 'numeric', month: 'short' }), // 10月5日 週一 13:50
  /** How old a frame is: minutes up to an hour and a half, hours beyond. A viewer's clock running behind must not read as "in 3 minutes". */
  age(time: number, now: number) {
    const min = Math.round((now - time) / 60e3)
    return min <= 0 ? zh['age.now'] : min < 90 ? ago.format(-min, 'minute') : ago.format(-Math.round(min / 60), 'hour')
  },
}
export const useT = () => I18N
