import assert from 'node:assert/strict'
import test from 'node:test'
import { getObservations, invalidateObservations, type Observation } from './api'
import { stationSnapshot } from './components/chartData'

const row = (temperature: number): Observation => ({ stationId: 42, observedAt: '2020-01-01T00:00:00.000Z', temperature,
  humidity: 75, pressure: null, windSpeed: null, windDirection: null, gustSpeed: null, rain1h: null, rain24h: null })
const response = (observations: Observation[]) => Response.json({ observations })

test('map and station card share each selected-time request, and a new time gets different readings', async (t) => {
  invalidateObservations()
  const urls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => { urls.push(url); return response([row(urls.length === 1 ? 20 : 25)]) })
  const time1 = '2020-01-01T00:00:00.000Z', time2 = '2020-01-01T01:00:00.000Z'
  const map = getObservations(time1), card = getObservations(time1)
  assert.equal(map, card)
  assert.equal(stationSnapshot(await card, 42)?.temperature, 20)
  assert.equal(stationSnapshot(await getObservations(time2), 42)?.temperature, 25)
  assert.equal(stationSnapshot(await card, 999), null)
  assert.deepEqual(urls, [time1, time2].map((time) => `/api/observations?at=${encodeURIComponent(time)}`))
})

test('empty and failed observation requests can recover for the same historical time', async (t) => {
  invalidateObservations()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    if (calls === 1) return new Response('', { status: 503 })
    return response(calls === 2 ? [] : [row(25)])
  })
  const at = '2020-01-01T00:00:00.000Z'
  await assert.rejects(getObservations(at), /503/)
  assert.deepEqual(await getObservations(at), [])
  assert.equal((await getObservations(at))[0].temperature, 25)
  assert.equal(calls, 3)
})

test('an old failure after Retry cannot evict the replacement request', async (t) => {
  invalidateObservations()
  const resolvers: ((value: Response) => void)[] = []
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => resolvers.push(resolve)))
  const at = '2020-01-01T00:00:00.000Z'
  const old = getObservations(at)
  const rejected = assert.rejects(old, /503/)
  invalidateObservations()
  const replacement = getObservations(at)
  resolvers[0](new Response('', { status: 503 }))
  await rejected
  assert.equal(getObservations(at), replacement)
  resolvers[1](response([row(25)]))
  assert.equal((await replacement)[0].temperature, 25)
  assert.equal(resolvers.length, 2)
})
