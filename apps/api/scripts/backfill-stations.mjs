// Drives POST /api/internal/backfill/stations until CWA's 24 hourly station snapshots are stored. The work happens
// on the API it calls (the deployed one by default, next to the database); pass another origin as the first argument.
const base = process.argv[2] ?? process.env.API_BASE_URL, secret = process.env.INGESTION_SECRET
if (!base || !secret) throw new Error('API_BASE_URL and INGESTION_SECRET must be set in .env')
let before = ''
do {
  const res = await fetch(`${base}/api/internal/backfill/stations?limit=4${before && `&before=${encodeURIComponent(before)}`}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } })
  if (!res.ok) throw new Error(`backfill responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { files, next } = await res.json()
  console.table(files)
  before = next
} while (before)
