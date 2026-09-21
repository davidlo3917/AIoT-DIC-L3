// Proves private.prune() keeps/thins/expires the right rows. Everything runs in one transaction that is
// always rolled back, so it is safe against the live database. Pass a migration file to rehearse it first:
//   node --env-file=../../.env scripts/prune-check.mjs ../../supabase/migrations/<file>.sql
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} })
const ROLLBACK = new Error('rollback')
try {
  await sql.begin(async (tx) => {
    if (process.argv[2]) await tx.unsafe(readFileSync(process.argv[2], 'utf8'))
    const [{ id }] = await tx`insert into stations (cwa_station_id, name, latitude, longitude) values ('PRUNECHK', 'prune check', 0, 0) returning id`
    const cases = { // label → [age, minute-of-hour, survives?]
      'expired (61 d, on the hour)': ['61 days', 0, false],
      'old, off the hour → thinned': ['4 days', 10, false],
      'old, on the hour → kept': ['4 days', 0, true],
      'recent, off the hour → kept': ['1 day', 10, true],
      'recent, on the hour → kept': ['1 day', 0, true],
    }
    for (const [label, [age, minute]] of Object.entries(cases))
      await tx`insert into station_observations (station_id, observed_at, temperature) values (${id}, date_trunc('hour', now() - ${age}::interval) + make_interval(mins => ${minute}), ${Object.keys(cases).indexOf(label)})`
    const before = (await tx`select count(*)::int n from station_observations where station_id <> ${id}`)[0].n

    const [{ r }] = await tx`select private.prune(interval '3 days', interval '60 days') as r`
    const left = new Set((await tx`select temperature::int t from station_observations where station_id = ${id}`).map((x) => x.t))
    Object.entries(cases).forEach(([label, [, , survives]], i) => { assert.equal(left.has(i), survives, label); console.log('ok  ', label) })
    assert.equal((await tx`select count(*)::int n from station_observations where station_id <> ${id}`)[0].n, before, 'real rows inside the windows must be untouched')
    console.log('ok   real rows untouched (', before, ')')
    assert.ok(r.expired >= 1 && r.thinned >= 1 && r.db_bytes > 0, JSON.stringify(r)); console.log('ok   size log row:', JSON.stringify(r))
    await assert.rejects(tx.savepoint((s) => s`select private.prune(interval '3 days', interval '1 day')`), /0 < fine < hourly/); console.log('ok   refuses inverted windows')
    const [p] = await tx`select has_function_privilege('anon', 'private.prune(interval, interval)', 'execute') f`
    assert.equal(p.f, false); console.log('ok   anon cannot execute')
    throw ROLLBACK
  })
} catch (e) { if (e !== ROLLBACK) { console.error('FAILED:', e.message); process.exitCode = 1 } }
const [{ n }] = await sql`select count(*)::int n from stations where cwa_station_id = 'PRUNECHK'`
console.log(n === 0 ? 'rolled back cleanly' : 'WARNING: probe station left behind'); await sql.end()
