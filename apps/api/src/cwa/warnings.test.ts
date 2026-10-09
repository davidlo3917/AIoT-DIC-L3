import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeWarnings } from './warnings.js'

// A 陸上強風特報 over nine counties, captured from W-C0033-001 / -002 on 2026-10-09.
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const counties = read('warnings-counties-2026-10-09.json'), texts = read('warnings-texts-2026-10-09.json')

test('warnings: one advisory per phenomenon and period, its counties, Taiwan times as instants, and CWA text', () => {
  const [w, ...rest] = normalizeWarnings(counties, texts)
  assert.equal(rest.length, 0)
  assert.equal(w.phenomena, '陸上強風')
  assert.equal(w.significance, '特報')
  assert.equal(w.start, '2026-10-09T02:36:00.000Z') // 10:36 Taiwan time
  assert.equal(w.end, '2026-10-10T15:00:00.000Z')
  assert.deepEqual(w.counties.sort(), ['屏東縣', '彰化縣', '新竹縣', '桃園市', '澎湖縣', '臺中市', '臺東縣', '苗栗縣', '連江縣'].sort())
  assert.match(w.text!, /^一、概述：東北風偏強/)
  assert.doesNotMatch(w.text!, /\n {4}/) // CWA's indentation is gone
})

test('no hazards anywhere is an empty list; a broken document is an error', () => {
  const quiet = { records: { location: counties.records.location.map((l: { locationName: string }) => ({ locationName: l.locationName, hazardConditions: { hazards: [] } })) } }
  assert.deepEqual(normalizeWarnings(quiet, { records: { record: [] } }), [])
  assert.throws(() => normalizeWarnings({ records: { location: [{ hazardConditions: {} }] } }, { records: {} }))
})
