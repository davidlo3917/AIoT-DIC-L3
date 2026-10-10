import { useEffect, useState } from 'react'
import { getForecast, type ForecastPeriod } from '../api'
import { useStore } from '../timeline/store'

/** A township's week from `/api/forecast`: null while loading (or while the township is unknown), 'error' when the fetch failed; Retry refetches. */
export function useForecast(county: string | null | undefined, town: string | null | undefined) {
  const refreshKey = useStore((s) => s.refreshKey)
  const [forecast, setForecast] = useState<ForecastPeriod[] | 'error' | null>(null)
  useEffect(() => {
    setForecast(null) // never another township's week under this one's name
    if (!county || !town) return
    let alive = true
    getForecast(county, town).then((periods) => { if (alive) setForecast(periods) }, () => { if (alive) setForecast('error') })
    return () => { alive = false }
  }, [county, town, refreshKey])
  return forecast
}

/** Escape closes whichever card is open. */
export function useEscape(close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
}
