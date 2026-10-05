import type { Key } from './i18n'
import { actions } from './timeline/store'

/** A line for the timeline's status row: what to say and, when something can be done about it, a button. */
export type Status = { key: Key; action?: { key: Key; run: () => void } } | null

const retry = { key: 'retry', run: actions.retry } as const

// Constants rather than literals where they are raised: a status travels through effects, and a fresh object on
// every render would re-run them forever. Waiting has no button; anything that went wrong can be retried.
export const STATUS = {
  loadingMap: { key: 'status.loadingMap' },
  loadingWeather: { key: 'status.loadingWeather' },
  timelineError: { key: 'status.timelineError', action: retry },
  empty: { key: 'status.empty', action: retry },
  noData: { key: 'status.noData', action: retry },
  noHumidity: { key: 'status.noHumidity', action: retry },
  noStationReadings: { key: 'status.noStationReadings', action: retry },
  stationReadingsFailed: { key: 'status.stationReadingsFailed', action: retry },
  stationsFailed: { key: 'status.stationsFailed', action: retry },
} satisfies Record<string, Status>
