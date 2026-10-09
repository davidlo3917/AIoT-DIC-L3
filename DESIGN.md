# Taiwan Weather Map — System Design (as built)

This document describes the system as it runs today, not as it was first planned. The original plan (September 2026) listed wind particles, satellite, lightning, typhoon tracks and warnings; what shipped is the subset in §3, and the rest is listed in §20 with what it would take. Where a decision changed along the way, §21 says why.

Live: <https://a-io-t-dic-l3.vercel.app> · Source: `davidlo3917/AIoT-DIC-L3` on GitHub · User guide (zh-TW): `README.md`

---

## 1. Summary

A Windy-style weather map of **Taiwan and the surrounding sea**, built on the **Central Weather Administration (CWA) Open Data API**.

What a visitor gets:

- A full-screen interactive map (MapLibre GL) with one weather layer at a time: temperature, rain, radar, satellite, humidity
- 1,367 weather and rain-gauge stations drawn as value-labelled dots, thinned by zoom level
- A station card with the current readings, the township's 7-day forecast and a 24-hour chart
- A shared timeline that plays back the last **7 days** of every layer at 10-minute (or hourly) steps
- Traditional Chinese (Taiwan) interface only; all times in Taiwan time (UTC+8)
- Works on phones, including landscape

What the system does behind that:

- Fetches CWA data every 10 minutes on a schedule, normalises it and keeps 7 days of history (CWA itself only serves the latest snapshot of most products)
- Stores station readings in Postgres and gridded/raster products as PNG frames in object storage
- Serves everything through a small read-only HTTP API behind a CDN
- Deploys automatically from `main`

---

## 2. Product Experience

The application is a map, not a dashboard. Everything else floats over it and gives way when space is short.

```text
┌────────────────────────────────────────────────────────────────┐
│ 臺灣天氣  資料來源：中央氣象署                        [+][−][i] │
│ ┌────────┐                                   ┌───────────────┐ │
│ │ 溫度   │                                   │ 臺中        ✕ │ │
│ │ 雨量   │          weather surface          │ readings      │ │
│ │ 雷達   │          + station dots           │ 7-day forecast│ │
│ │ 濕度   │                                   │ 24 h chart    │ │
│ │ ☑ 測站 │                                   └───────────────┘ │
│ └────────┘                                                     │
│ ┌────────┐                                                     │
│ │ legend │                                                     │
│ └────────┘                                                     │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ ⏮ ▶ ⏭  10月9日週五 14:00 UTC+8 · 66 分鐘前   ● 即時  速度 1× │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━● │ │
│ │ 10/2 15:00          過去 7 天 · 每小時更新         10/9 14:00 │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

Layout rules (implemented in `App.tsx` with Tailwind variants):

- **Roomy screens** (≥ 640 px wide *and* tall): layer list and legend in a left sidebar, station card on the right reaching down to the timeline.
- **Compact screens** (phones, either orientation): the layer list becomes one row of buttons, the stations toggle moves next to the legend, and the legend row hides while a station card is open.
- The **timeline never leaves the screen**. The region that shrinks and scrolls is the layer list / station card. A phone in landscape leaves ~300 px under the browser's bars; the title hides below 360 px of height.
- Every control is at least 44 × 44 px, keyboard reachable, and labelled for screen readers (the legend is an `img` with a sentence as its label).

Interaction:

- One layer at a time; the legend names it and says in one sentence what it shows ("雷達：目前哪裡在下雨").
- The timeline **follows the newest data** until the visitor scrubs; "即時" lights up while following, "回到最新" brings it back. Dragging to the right end also resumes following.
- **Play** from the newest frame replays the recent loop (3 h; the whole day for the hourly temperature layer) rather than the whole week. From anywhere else it plays forward.
- Keyboard: Space play/pause, ← → step. When the map itself has keyboard focus (reached by Tab) the arrows pan the map instead.
- Clicking a station opens its card; the card's readings follow the timeline, and its chart shows the 24 h around the map time.
- Status messages (loading, no data for this time, request failed) appear as one line inside the timeline panel, with a Retry button when retrying can help.

---

## 3. Weather Layers and Data Sources

| Layer | What it shows | CWA dataset | Cadence | How it reaches the screen |
|---|---|---|---|---|
| 溫度 Temperature | Air temperature grid, land only | `O-A0038-003` (0.03°, 67 × 120) | hourly | grid → rg16 PNG frame → coloured in the browser |
| 雨量 Rain | Radar-estimated rainfall of the past hour | `O-B0045-001` (0.0125°, 921 × 881) | 10 min | same as temperature |
| 雷達 Radar | Composite reflectivity picture (dBZ) | `O-A0058-005` (PNG, 3600²) | 10 min | copied to Storage as-is, resampled in the browser |
| 衛星 Satellite | Himawari infrared colour cloud picture, coastlines drawn in | `O-C0042-002` (JPG, 800²) | 10 min | same as radar; no legend, the picture has no scale to read |
| 濕度 Humidity | Relative humidity | station observations (no CWA grid exists) | 10 min | interpolated in the browser (§13) |

Station data:

| Purpose | CWA dataset | Notes |
|---|---|---|
| Automatic weather stations | `O-A0001-001` | also the only station dataset with a usable history API (24 hourly snapshots) |
| Rain gauges | `O-A0002-001` | |
| Staffed (manned) stations | `O-A0003-001` | the ones people know: 臺北, 臺中, 高雄… |
| Township 7-day forecast | `F-D0047-003 … -087` (one dataset per county, every 4th id) | 12-hourly periods; rain probability for the first 3 days only |

The three station datasets overlap (2,581 records, 1,365–1,367 unique stations); later datasets win on metadata. CWA publishes observations about 15 minutes late, and the radar picture 8–10 minutes after its frame time.

Typhoons (`W-C0034-005`, every active tropical cyclone with CWA's past fixes, wind radii and forecast positions) are not a layer but an overlay drawn over whichever layer is up, proxied live like the forecast (§7, §13).

Not built: wind, lightning, warnings (§20).

---

## 4. High-Level Architecture

```text
                 ┌─────────────────────┐
                 │   CWA Open Data     │  REST datastore (stations, forecast)
                 │                     │  file API → public S3 (grids, radar and satellite pictures)
                 └──────────┬──────────┘
                            │ fetch, server-side only (API key)
   Supabase Cron            ▼
   (pg_cron + pg_net) ──▶ ┌─────────────────────┐        ┌──────────────────────┐
   POST /api/internal/…   │  API — Hono on a    │ SQL    │ Supabase Postgres    │
   bearer secret from     │  Vercel Function    │◀──────▶│ stations             │
   Vault                  │  (Tokyo, hnd1)      │        │ station_observations │
                          │                     │ HTTP   │ weather_frames       │
                          │                     │◀──────▶│ + cron, prune, vault │
                          └──────────┬──────────┘        └──────────────────────┘
                                     │                   ┌──────────────────────┐
                                     │ upload / delete   │ Supabase Storage     │
                                     └──────────────────▶│ weather-data bucket  │
                                                         │ (public read, PNG)   │
                          ┌─────────────────────┐        └──────────┬───────────┘
   Browser ──────────────▶│ Vercel CDN          │                   │
   React + MapLibre       │ static site + /api  │  frames (PNG) ◀───┘
                          │ cached responses    │
                          └─────────────────────┘
   Basemap tiles ◀──────── OpenFreeMap (tiles.openfreemap.org, vector tiles + fonts)
```

Three principles hold the shape together:

1. **The browser never talks to CWA or to the database.** Only the API holds the CWA key and the database password.
2. **The database holds what is queried, Storage holds pictures.** A station reading is a row; a 921 × 881 rain grid is a 4 KB PNG with a row pointing at it.
3. **Everything public is cacheable.** Responses are identical for every visitor, so the CDN absorbs the traffic and the free-tier database sees a few requests a minute.

---

## 5. Technology Stack

| Part | Choice | Version |
|---|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, MapLibre GL JS | React 19, Vite 8, Tailwind 4, MapLibre 6.10 |
| Backend | Hono on Vercel Functions (`hono/vercel` adapter) | Hono 4 |
| Validation | zod (every query parameter and every CWA response shape) | zod 4 |
| Database | Supabase Postgres (free tier, Tokyo), Drizzle ORM + postgres.js | drizzle-orm 0.45 |
| Migrations | Drizzle Kit (generate only) + Supabase CLI (apply) | |
| Object storage | Supabase Storage, called with plain `fetch` (three calls did not justify `supabase-js`) | |
| Scheduling | Supabase Cron (`pg_cron` + `pg_net`), secrets in Supabase Vault | |
| Basemap | OpenFreeMap "fiord" style, filtered and recoloured (§13) | |
| Tooling | pnpm workspaces, Task (`Taskfile.yml`), Node 22, `node:test` | pnpm 10 |
| Hosting | Vercel (one project: static site + API), GitHub Actions for CI | |

Deliberately absent: Turborepo, a `packages/` layer, Python/GRIB tooling, a client-side state library (a 70-line `useSyncExternalStore` store is enough), and `supabase-js`.

---

## 6. Repository Structure

```text
.
├── api/index.ts                 Vercel function entry: re-exports the Hono handler
├── apps/
│   ├── web/                     React + MapLibre frontend
│   │   └── src/
│   │       ├── api.ts           typed fetchers for /api, 7-day window, observation cache
│   │       ├── layers.ts        the five layers: frames source, cadence, loop, kind, legend
│   │       ├── ramps.ts         colour ramps and MapLibre colour expressions
│   │       ├── i18n.ts          every string, Taiwan-time formatters
│   │       ├── status.ts        the status line's messages and actions
│   │       ├── components/      LayerPanel, Legend, StationCard, Sparkline, chartData
│   │       ├── map/             MapView, basemap filter, useWeather (surface + stations + playback)
│   │       │   └── layers/      grid decode/paint, IDW, station dots + zoom thinning
│   │       └── timeline/        Timeline UI, store, keyboard shortcuts
│   └── api/                     Hono API
│       ├── src/
│       │   ├── app.ts           routes + error handling
│       │   ├── routes/          public routes, query schemas
│       │   ├── cwa/             CWA client, station normaliser, forecast normaliser
│       │   ├── ingestion/       stations (+ backfill), grids + pictures (radar, satellite), frame prune
│       │   ├── db/              Drizzle schema, client
│       │   ├── lib/             grid parsing, PNG encoder, Storage calls
│       │   └── middleware/      bearer auth for /internal
│       ├── scripts/             db-push, cron-secrets, cron-status, backfill, prune-check
│       └── drizzle.config.ts
├── supabase/migrations/         generated schema SQL + hand-written cron/prune/RLS SQL
├── docs/screenshots/            README pictures
├── .github/workflows/ci.yml
├── Taskfile.yml                 every operator command
└── vercel.json                  build, rewrites, security headers
```

Tests (`*.test.ts`) sit next to the code they test and run with Node's built-in runner: station/forecast normalisation, grid parsing, query validation, the timeline store, request ordering, IDW, time formatting.

---

## 7. API

All public routes are read-only `GET`s under `/api`, JSON, and every response carries `Cache-Control: public, s-maxage=…, stale-while-revalidate=…` so Vercel's CDN serves repeats. Times are ISO-8601 with an offset (`2026-10-09T14:00:00+08:00` or `…Z`); invalid parameters get `400` with a message.

| Route | Returns | CDN |
|---|---|---|
| `GET /api/health` | `{ ok, db }` — database reachable? | none |
| `GET /api/stations` | all stations: id, CWA id, name, county, town, WGS84 position, elevation | 1 h |
| `GET /api/stations/:cwaId/history?from=&to=` | one station's observations in the range (default last 24 h, max 8 days) | 60 s |
| `GET /api/observations?at=` | every station's reading at one instant: per field, the newest non-null value in the 100 min before `at` (stations report at different cadences) | 60 s |
| `GET /api/forecast?county=&town=` | a township's 12-hourly periods for the coming week; proxied live from CWA, nothing stored; only townships that have a station are accepted | 30 min |
| `GET /api/typhoons` | every active tropical cyclone: past fixes, the current one with 15/25 m/s wind radii, forecast fixes with the 70 % probability radius; proxied live from CWA, nothing stored | 10 min |
| `GET /api/frames?layer=&from=&to=` | the timeline contract: `[{ time, url?, bounds?, meta? }]` for `stations`, `radar`, `satellite`, `rain-grid` or `temperature-grid` | 60 s |

The **frames contract** is the one shape every layer answers in. Station frames are a synthetic 10-minute grid clipped to what is stored (no URL: the browser asks `/observations` per frame). Grid and picture frames carry the Storage URL and the WGS84 bounds; encoded grids also carry their decoding recipe in `meta`.

Internal routes are `POST`, require `Authorization: Bearer $INGESTION_SECRET`, and are called by Supabase Cron:

| Route | Does |
|---|---|
| `/api/internal/ingest/stations` | fetch the three station datasets, upsert stations, insert observations |
| `/api/internal/ingest/grids[?layer=]` | temperature grid, rain grid, radar and satellite pictures → Storage + `weather_frames`; `layer=` runs one |
| `/api/internal/backfill/stations?before=&limit=` | fill hourly station readings from CWA's 24-hour history API |
| `/api/internal/prune/frames` | delete frames older than 7 days (≤ 1,000 per call) |

Error handling: `app.onError` logs the full error server-side and returns `{ error: "internal error" }`; CWA errors never include the request URL, because the API key travels in it. Hono's `HTTPException`s (the `400`s, bearer `401`) pass through.

---

## 8. Database

Three tables, all with **row-level security enabled and no policies**: Supabase exposes `public` over PostgREST to anyone with the project's anon key, and RLS with no policies means zero rows. The API connects as the database owner through the transaction pooler (`prepare: false`, one connection per function instance, TLS required, connect/idle timeouts).

```text
stations
  id serial PK · cwa_station_id text unique · name · county · town
  latitude, longitude double (WGS84) · elevation real · created_at · updated_at

station_observations                       PK (station_id, observed_at); index (observed_at desc)
  station_id → stations · observed_at timestamptz
  temperature real · humidity smallint · pressure real · wind_speed real · wind_direction smallint
  gust_speed real · rain_1h real · rain_24h real
  (no surrogate id, no created_at: ~190k rows/day on a 500 MB plan, ~240 B per row with indexes)

weather_frames                             index (layer_type, valid_at desc); storage_path unique
  id serial PK · layer_type text (radar | satellite | rain-grid | temperature-grid) · valid_at timestamptz
  storage_path text · min_lat, max_lat, min_lon, max_lon double · metadata_json jsonb · created_at
```

Also in the database, outside the schema Drizzle manages (hand-written migrations):

- `private.trigger_ingest(path)` — `security definer`, empty `search_path`, reads `api_base_url` and `ingestion_secret` from Vault and `net.http_post`s to the API. Execute revoked from `public`.
- `private.prune(fine, hourly)` — the nightly retention job (§11); writes one row per night to `private.db_size_log` (database size, row counts, rows thinned/expired).
- `cron.job` rows for the five schedules (§10).

Upserts are idempotent: observations conflict on `(station_id, observed_at)` and a later run never blanks a reading an earlier one stored (`coalesce(excluded.col, existing.col)`); frames conflict on `storage_path`. Every ingestion call can be repeated safely.

---

## 9. Storage and Frame Encoding

Bucket `weather-data` (public read, PNG and JPEG only, 5 MB per file). Paths embed the frame time, so a path's content never changes and files are uploaded with `Cache-Control: max-age=31536000, immutable`:

```text
temperature-grid/2026/10/09/0600Z.png     ~6 KB
rain-grid/2026/10/09/0600Z.png            ~4 KB
radar/2026/10/09/0600Z.png                CWA's own PNG, ~100 KB
satellite/2026/10/09/0600Z.jpg            CWA's own JPG, ~90 KB
```

**rg16 encoding.** A float grid becomes a PNG whose pixels carry the value, not a colour: `value16 = round((v + offset) × scale)`, red = high byte, green = low byte, alpha = 255 where valid and 0 for "no data" (sea, outside coverage). Temperature uses offset 50 / scale 100 (0.01 °C steps), rain offset 0 / scale 10 (0.1 mm steps). The recipe is stored in `metadata_json` and returned as `meta`, so the browser decodes any frame without knowing the layer. Colouring happens in the browser, which means a ramp can change without re-ingesting anything.

**Why PNG, not a raw binary:** the browser decodes it with `createImageBitmap` (fast, native, off the main thread), it compresses the large flat areas well, and Storage/CDN treat it as an ordinary image. PNG is encoded in the API with a 26-line zlib-based encoder (`lib/png.ts`) — no image library.

**Datum.** CWA grids are on TWD67; Taiwan-wide the shift to WGS84 is a near-constant −0.0018° lat / +0.0082° lon (~800 m, measured from CWA's own station records, which carry both). The shift is applied to the frame bounds at ingestion. Good to tens of metres; a real datum transform is the upgrade if sub-cell accuracy ever matters.

---

## 10. Ingestion and Scheduling

Supabase Cron calls the API; the API does the work next to the database. All times UTC in `cron.job`, shown here in Taiwan time:

| Job | Schedule | Calls |
|---|---|---|
| `ingest-stations` | every 10 min at :05, :15 … | `/api/internal/ingest/stations` |
| `ingest-grids` | every 10 min at :08, :18 … | `/api/internal/ingest/grids` (temperature, rain, radar, satellite) |
| `ingest-radar` | every 10 min at :03, :13 … | `/api/internal/ingest/grids?layer=radar` |
| `prune` | daily 03:30 | `private.prune(7 days, 7 days)` in SQL |
| `prune-frames` | daily 03:40 | `/api/internal/prune/frames` |

Design points:

- **Each product is independent.** `ingestGrids` runs the four products with `Promise.allSettled`; `ingestStations` fetches its three datasets the same way. One CWA hiccup costs one product for one cycle, never the whole cycle — and 10-minute readings CWA never serves again.
- **Radar is fetched twice per cycle** because CWA only ever serves the latest picture and publishes it 8–10 minutes after frame time; a single :08 fetch missed 23 of 143 frames a day, the extra :03 fetch brought that to ~2.
- **The radar and satellite pictures' URLs come from CWA documents**, so they are treated as untrusted: only `https://cwaopendata.s3.ap-northeast-1.amazonaws.com/` is fetched, redirects are refused, the file is capped at 5 MB and must start with the PNG or JPEG signature the product promises.
- **Upload before insert.** A `weather_frames` row must never point at a missing file; an orphan file is invisible, an orphan row would be a broken frame.
- **Backfill** exists only for automatic stations (`O-A0001-001` keeps 24 hourly XML snapshots). It is driven in batches of a few files per call so one call fits a function invocation.
- Every CWA call has a timeout (10–45 s) and every response is validated with zod before anything is written; one malformed station record is skipped and counted, not fatal.

---

## 11. Retention and Capacity

The free tier allows 500 MB of database and 1 GB of Storage. Measured: ~193k observation rows a day at ~240 B (with indexes) ⇒ about 46 MB/day; frames ~456/day, of which radar (~100 KB) and satellite (~90 KB) are nearly all the bytes.

Policy, since 2026-10-09: **every station reading and every frame is kept for 7 days**, which is exactly what the timeline plays back. Steady state ≈ 325 MB of database (plus a 12 MB empty baseline) and ≈ 200 MB of Storage.

- `private.prune(fine, hourly)` deletes observations older than the windows in one statement (the previous policy thinned 3–60-day-old rows to hourly; with both windows at 7 days that step is a no-op by design, and the function still supports it).
- `pruneFrames` deletes files first, then rows, at most 1,000 per night (about three days' worth, so a backlog clears in a few nights).
- The nightly job logs the database size to `private.db_size_log`; `task cron:status` prints the last week.
- `scripts/prune-check.mjs` rehearses a retention change inside a transaction that is always rolled back, reporting how many rows it would keep, thin and expire.

Changing the windows is a migration that re-runs the `cron.schedule` line, never a dashboard edit.

---

## 12. Timeline

One store (`timeline/store.ts`) owns the timeline for every layer: the active layer, its frames, the cursor, play state, speed, follow-latest, and which station is selected. Components read it with `useSyncExternalStore`; the map hook writes frames into it.

```text
layer changes ──▶ request++ ──▶ GET /frames?layer=…&from=<now − 7 d, rounded down to the hour>
                                    │
                        setFrames(layer, token, frames)   ← ignored if the layer or token moved on
                                    │
              follow-latest ? index = last : index = last frame ≤ previous cursor time
```

- `from` is rounded down to the hour so every visitor in that hour asks the CDN the same URL.
- Frames are re-polled every 5 minutes so an open tab keeps up. A failed re-poll shows "無法更新時間軸" with Retry but keeps the frames on screen and does not stop playback.
- Request tokens and AbortControllers make out-of-order answers harmless: an old layer's frames can never land on a new layer (tested in `store.test.ts`).
- Switching layers keeps the cursor time: the new layer opens at the nearest earlier frame unless the visitor was following the latest.
- Playback is driven by the map hook, not a timer in the store: the next tick is scheduled only after the current frame is actually on the map, so a slow radar frame plays slower instead of being skipped.
- The slider is a native `<input type="range">`; its `aria-valuetext` is the formatted time.

---

## 13. Rendering and Animation

**Basemap.** OpenFreeMap's `fiord` style is loaded through MapLibre's `transformStyle` and reduced to an allowlist: background, water, boundaries, motorway/trunk/primary roads (above the weather, as the only geographic reference), and place labels with Traditional Chinese names first. Everything else is dropped so the weather is the picture, and a provider style update cannot add clutter.

**One surface, blended inside a canvas.** Every layer draws into a single MapLibre **canvas source** of constant opacity. A frame transition draws `old × (1 − a) + new × a` into that canvas with `globalCompositeOperation = 'lighter'` over ~350 ms (shorter at higher speeds, none with `prefers-reduced-motion`). The first implementation crossfaded two raster layers and dipped visibly mid-fade (two half-transparent layers cover less than one full one); this was measured per animation frame with `gl.readPixels` before being replaced.

**Mercator-correct rows.** MapLibre stretches an image linearly in Web-Mercator, but CWA grids and the radar picture are evenly spaced in latitude. Both are redrawn one row at a time at Mercator-even positions before upload (`paint` / `resample`), otherwise a 7°-tall field sits ~7 km off the coast in the middle.

**Grids.** The rg16 PNG is decoded with `createImageBitmap` (`premultiplyAlpha: 'none'`, no colour conversion — the bytes are the data) and coloured through the layer's ramp. Coarse grids (temperature, 3 km cells) are upsampled 6× with bilinear interpolation so the surface reads as a field; stepped ramps (rain) stay nearest-neighbour so no value is invented across a threshold. Land-only layers are drawn ~2 cells past CWA's staircase land mask and clipped by a copy of the basemap's water polygons drawn on top (`surface-coast`), so the true coastline cuts them.

**Pictures (radar, satellite).** CWA's 3600² radar PNG (52 MB decoded) is decoded at 1200 or 1800 px depending on the screen, resampled once, and cached ready to blit — on a phone that is the difference between smooth playback and the tab being killed. The 800² satellite JPG takes the same path. Neither is coloured here, so the legend shows radar's dBZ scale read off CWA's palette and, for satellite, only the layer's name and hint.

**Humidity.** No CWA grid exists, so the station readings are interpolated in the browser with inverse-distance weighting (1/d²) onto the latest temperature grid's land cells, which gives Taiwan's outline for free. ~3.5k land cells × ~1.2k stations ≈ 4M distances, ~20 ms. A k-nearest index is the upgrade if either count grows 10×.

**Stations.** Drawn as a GeoJSON source with a circle layer (colour from the ramp) and a symbol layer (the value). Zoomed out, only the most relevant stations are shown at least 44 px apart; each zoom level from 5 to 11 adds the next most relevant ones that fit, computed once per frame in `minZooms()` and stored as a per-feature `minzoom` that the layer filter compares with the zoom. Relevance: staffed stations (`46…`) before automatic (`C0…`) before the rest, lower elevation first (the town over the peak above it); for rain, the wettest first, and dry gauges are not drawn at all. Labels blinked ~400 ms per step until two fixes: the map's `fadeDuration` is 0 (a label whose text changed counts as new and would fade in), and the previous frame's stations stay up until the next frame's replace them. The same keep-until-replaced rule holds for the station card, which otherwise blanked on every playback step.

**Typhoons.** One GeoJSON source holds, per cyclone, the past track (solid), the forecast track (dashed), the fixes as dots (the current one orange and named, forecast ones labelled with their time), the 15 and 25 m/s wind radii at the current fix and the 70 % probability circles ahead; circles are 48-point rings on an equirectangular approximation. It sits above the weather and the coast clip (a track crosses the sea) and below the stations. The list is refetched every 10 minutes on its own clock. Storms are usually far off-screen, so a chip under the layer list names each one; tapping it fits the track into the part of the screen the panels leave free, or centres the storm where the whole track cannot fit. The map's bounds were widened to CWA's basin (100–180°E, 0–50°N) for this.

**Preloading.** Two frames ahead are fetched and decoded during playback so the network is not in the loop.

---

## 14. Migration Strategy

Schema changes are version-controlled and applied in one direction:

```text
1. edit apps/api/src/db/schema.ts
2. task db:generate -- --name <change>      drizzle-kit generate → supabase/migrations/<timestamp>_<change>.sql
3. review the SQL, commit it (+ the updated meta/ snapshot and journal)
4. task db:plan                             supabase db push --dry-run
5. task db:push                             supabase db push (prompts; it is the live database)
6. deploy the application
```

Hand-written SQL migrations live in the same folder for what Drizzle does not model: `pg_cron` schedules, the `private` schema functions, RLS, Vault access. The file name's timestamp orders them; a generated file is renamed if it would sort before an already-applied one. `drizzle-kit push` is never used, and the Drizzle config is generate-only.

Migrations run through the **session** pooler (port 5432, derived from `DATABASE_URL` by `scripts/db-push.mjs`), because the transaction pooler cannot run them; the application itself uses the transaction pooler.

---

## 15. Deployment

One Vercel project built from the repository root:

- `installCommand`: `pnpm install --frozen-lockfile`
- `buildCommand`: `pnpm typecheck && pnpm test && pnpm build` — a failing test blocks the deploy
- `outputDirectory`: `apps/web/dist` (static site)
- `/api/(.*)` is rewritten to the function at `api/index.ts`, which re-exports the Hono handler; Hono routes on the original path
- Region `hnd1` (Tokyo), next to the Supabase project
- Security headers on every response (§18)

Push to `main` deploys production. Other branches get preview deployments, which are SSO-protected. Migrations are not applied by the deploy; they are a separate, deliberate `task db:push`.

---

## 16. CI and Checks

`task check` runs what CI and the Vercel build run: `pnpm typecheck`, `pnpm test`, `pnpm build`. GitHub Actions runs it on every push and pull request with read-only permissions and actions pinned to commit SHAs.

Tests use `node:test` through `tsx`, no framework. They cover the parts that would fail silently: CWA parsing and sentinel values, grid parsing, the query schemas (ranges, ids, township names), the timeline store's request ordering, the observation cache, IDW, Taiwan-time formatting, the station-thinning geometry.

---

## 17. Environment Variables and Secrets

Set in `.env` locally (git-ignored; `.env.example` lists the names) and in Vercel for production. The API reads them at request time.

| Variable | Used by | Notes |
|---|---|---|
| `CWA_API_KEY` | API | CWA Open Data authorization key. Server-side only; never `VITE_`-prefixed. Travels as a query parameter, so no error message may include a CWA URL. |
| `SUPABASE_URL` | API | project URL; also the public base of frame URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Storage uploads and deletes |
| `SUPABASE_STORAGE_BUCKET` | API | `weather-data` |
| `DATABASE_URL` | API, scripts | transaction pooler (6543); migrations switch to 5432 themselves |
| `INGESTION_SECRET` | API, cron | `openssl rand -hex 32`; the API refuses to serve `/internal` with anything shorter than 32 characters |
| `API_BASE_URL` | cron | production origin, `https://` only; copied with `INGESTION_SECRET` into Supabase Vault by `task cron:secrets` |

GitHub holds no secrets: CI needs none, and the ingestion runs from Supabase, not from Actions.

---

## 18. Security

What is in place, and what it protects against:

| Measure | Where |
|---|---|
| CWA key and database password exist only in the API's environment; the browser bundle contains no key or Supabase URL | §17 |
| Internal routes: `Authorization: Bearer` only (query tokens ignored), timing-safe compare, fail closed when unconfigured | `middleware/ingestAuth.ts` |
| Every query parameter validated with zod before it reaches SQL, logs or CWA: ISO instants, 8-day range cap, station id `^[A-Za-z0-9]{4,12}$`, county from a fixed list, township shape **and** must belong to a station | `routes/query.ts`, `routes/public.ts` |
| All SQL parameterised through Drizzle; the one `sql.raw` uses hard-coded column names | `routes/public.ts` |
| The forecast proxy cannot be pointed elsewhere: fixed host, dataset from the county map, township URL-encoded | `cwa/client.ts`, `cwa/forecast.ts` |
| The radar and satellite fetches only follow CWA's own S3 host, no redirects, 5 MB cap, PNG/JPEG signature checked | `ingestion/grids.ts` |
| Generic error bodies; details only in server logs | `app.ts` |
| Postgres: TLS enforced, RLS on every table with no policies, cron functions `security definer` with empty `search_path` in a non-exposed schema, execute revoked from `public`, secrets in Vault | migrations |
| Response headers on every route: `Content-Security-Policy` (`default-src 'self'`; connections only to the API, OpenFreeMap and Supabase Storage; `frame-ancestors 'none'`; no inline scripts or styles), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (Vercel) | `vercel.json` |
| Vercel WAF rate limit on `/api` (~600 requests/min per IP → 403) | Vercel dashboard |
| CI: read-only token, actions pinned to SHAs; pnpm: no package younger than 7 days, no git/tarball sub-dependencies, overrides for advisories in build-only tools; `pnpm audit` clean | `.github/workflows/ci.yml`, `pnpm-workspace.yaml` |
| GitHub secret scanning, push protection and Dependabot alerts on; nothing sensitive in the history (gitleaks) | repository settings |

Known limits, accepted for this project:

- The API connects as the database owner. A dedicated role with `SELECT/INSERT/DELETE` on three tables would contain a future injection; there is none today.
- `ssl: 'require'` encrypts but does not verify Supabase's certificate (`ssl: { ca }` would).
- Any distinct query string is a CDN miss; queries are indexed and bounded, and the WAF caps volume, so this is a load question, not a data one.
- Supabase's Data API is enabled but unused; RLS is what keeps it empty. Turning it off in the dashboard removes the dependency on remembering RLS for new tables.

---

## 19. Operations and Local Development

Everything an operator does is a `task` command (`task` alone lists them): `dev`, `web`, `api`, `stop`, `check`, `health`, `ingest`, `db:generate`, `db:plan`, `db:push`, `cron:secrets`, `cron:status`, `backfill:stations`, `prune:check`. The README documents each.

Facts worth knowing:

- Node 22 is required (`nvm use`); the tasks check and say so. The web dev server is on 5273, the API on 8787, and `task stop` only kills processes started from this repository.
- There is **one database**: local development talks to production's. Reads are harmless; `task ingest`, `cron:secrets` and `backfill:stations` write (all idempotent).
- The transaction pooler occasionally wedges a long-lived local connection; the client now has connect/idle timeouts and the dev server logs unhandled rejections instead of dying. If it recurs, point the local `DATABASE_URL` at the session pooler (5432).
- `task cron:status` shows the schedules, the last runs, the HTTP responses pg_net recorded (kept ~6 h), row counts and the nightly size log.
- UI changes are verified on the production build with a headless-Chrome/CDP harness (screenshots, per-animation-frame pixel reads for flicker, console capture for CSP), because settled screenshots prove nothing about transitions.

---

## 20. Not Built, and What It Would Take

| Feature | Status | Shape of the work |
|---|---|---|
| Wind particles | not started | CWA WRF GRIB2 → GitHub Actions + Python (ecCodes/cfgrib) → U/V field files in Storage → WebGL particle layer; the frames contract already fits |
| Lightning, warnings | not started | lightning: KMZ ingestion into a table (the placemark format is unseen until a strike happens) + point layer on the station clock; warnings: `W-C0033-001` per-county proxy + county polygons (a static asset) + a list; the tables once designed for them were dropped on 2026-10-09 so the schema matches what runs |

---

## 21. Decisions and Lessons (dated)

- **2026-09-21** Rolling retention chosen over "keep everything" because of the 500 MB free tier. **2026-10-09** windows changed to 7 d / 7 d after measuring 281 MB at 1.13 M rows and a 60-day hourly steady state of ~590 MB.
- **2026-09-21** CWA grids found to be TWD67; a constant shift is applied (§9). Temperature grids separate rows with bare newlines; the parser splits on commas and whitespace.
- **2026-09-22** Two-layer crossfade replaced by one canvas with in-canvas blending after measuring a brightness dip mid-fade; playback clock advances only after a frame is shown.
- **2026-09-22** Backfill limited to station history: CWA keeps no archive of the temperature grid, rain grid or radar picture. Switching radar to the archived dBZ grid (`O-A0059-001`, 8.9 MB XML per frame) was declined.
- **2026-10-05** Radar ingested twice per cycle after counting 23 missed frames a day and polling CWA's publish timing.
- **2026-10-05** TLS enforced on the database, WAF rate limit added, README rewritten in zh-TW.
- **2026-10-09** Chinese-only UI; stations on by default and thinned by zoom; label and card flicker fixed with keep-until-replaced; township forecast added as a live proxy; 7-day playback; four speculative tables and unused API fields removed; security headers, dependency overrides and CI pins added; this document rewritten as-built.
- **2026-10-09** Satellite layer shipped: the radar ingest became a list of picture products (format, signature and JSON shape per product), and the legend learned to show a picture layer that has no scale.
- **2026-10-09** Typhoon tracks shipped as a live proxy plus an overlay, not a layer with history: CWA's document already carries the past track, so storing versions would only pay off for a "forecast vs. actual" feature nobody asked for.

---

## 22. Design Principles (as practised)

1. The browser never holds a credential and never talks to CWA or Postgres.
2. Every public response is cacheable and identical for everyone.
3. Pictures live in Storage, rows live in Postgres, and a row never points at a file that is not there yet.
4. One timeline, one frames contract, every layer answers it.
5. Keep the previous value on screen until the next one replaces it — for dots, labels and cards.
6. Measure before fixing a visual problem; a settled screenshot cannot see a flicker.
7. Validate everything that comes from outside (query parameters and CWA alike) and fail closed.
8. Idempotent writes everywhere, so any job can be re-run.
9. Schema changes are migrations in git, applied on purpose, never by a deploy.
10. Build what is used; delete what is not.
