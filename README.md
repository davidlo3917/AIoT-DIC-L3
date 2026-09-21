# Weather Taiwan

Windy-style weather map for Taiwan on CWA Open Data. Design: [DESIGN.md](DESIGN.md).

## Develop

```bash
nvm use            # Node 22
pnpm install
cp .env.example .env   # fill in — see DESIGN.md §17
task dev           # web on :5273, api on :8787 (proxied at /api) — `task` lists all tasks
```

## Database

Schema lives in `apps/api/src/db/schema.ts`. Never edit the production DB by hand.

```bash
pnpm db:generate          # schema → supabase/migrations/*.sql — review, commit
pnpm db:push --dry-run    # what would be applied
pnpm db:push              # apply via Supabase CLI (session pooler, derived from DATABASE_URL)
```

## API

Public, read-only, CDN-cached. Times are ISO-8601 with an offset (`2026-09-21T20:00:00+08:00` or `...Z`).

| Route | Returns |
|---|---|
| `GET /api/stations` | All stations (id, CWA id, name, county, WGS84 position, elevation) |
| `GET /api/stations/:cwaId` | One station + its latest readings |
| `GET /api/stations/:cwaId/history?from=&to=` | Its observations in a range (default last 24 h, max 62 days) |
| `GET /api/observations?at=` | Every station's newest reading at an instant (default now) — one timeline position |
| `GET /api/frames?layer=&from=&to=` | Timeline instants for a layer: `stations`, `radar`, `satellite`, `wind`, `rain-grid`, `temperature-grid` |
| `POST /api/internal/ingest/stations` · `/ingest/grids` · `/prune/frames` | Scheduled jobs. `Authorization: Bearer $INGESTION_SECRET` |

## Scheduled jobs (Supabase Cron)

`ingest-stations` and `ingest-grids` (CWA temperature + radar-rain grids and the composite radar image → frames in
Storage) every 10 min;
`prune-frames` nightly (image frames older than 14 days); `prune` nightly (10-minute data for 3 days, hourly for 60, then deleted — sized for the
500 MB free tier). `task cron:status` shows runs, responses and the daily DB-size log; `task cron:secrets` reloads the
API URL + token into Supabase Vault; `task prune:check` verifies the prune in a rolled-back transaction.

## Deploy

Push to `main` → Vercel. One project, root = repo root: static site from `apps/web/dist`, API from `api/index.ts`.
