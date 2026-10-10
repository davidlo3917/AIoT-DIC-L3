# Taiwan Weather Map — System Design (as built)

This document describes the system as it runs today, not as it was first planned. The original plan (September 2026) listed wind particles, satellite, lightning, typhoon tracks and warnings; all but lightning shipped (§3), and §20 records what was dropped and why. Where a decision changed along the way, §21 says why.

Live: <https://a-io-t-dic-l3.vercel.app> · Source: `davidlo3917/AIoT-DIC-L3` on GitHub · User guide (zh-TW): `README.md`

---

## 1. Summary

A Windy-style weather map of **Taiwan and the surrounding sea**, built on the **Central Weather Administration (CWA) Open Data API**.

What a visitor gets:

- A full-screen interactive map (MapLibre GL) with one weather layer at a time: temperature, rain, radar, satellite, wind, humidity
- 1,367 weather and rain-gauge stations drawn as value-labelled dots, thinned by zoom level
- A station card with the current readings, the township's 7-day forecast and a 24-hour chart
- A shared timeline that plays back the last **7 days** of every layer at 10-minute (or hourly) steps; the wind layer is a model forecast and runs on **3.5 days ahead** as well
- A forecast layer: the 22 counties coloured by each day's forecast temperature for the **week ahead**, a day per timeline step, with a county card (county list, high/low chart, day/night table)
- Traditional Chinese (Taiwan) interface only; all times in Taiwan time (UTC+8)
- Works on phones, including landscape

What the system does behind that:

- Fetches CWA data every 10 minutes on a schedule, normalises it and keeps 7 days of history (CWA itself only serves the latest snapshot of most products)
- Reads the 10 m wind out of CWA's WRF model GRIB2 files by HTTP range request, with a 120-line GRIB2 reader of its own
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
│ │ 衛星   │                                   │ 24 h chart    │ │
│ │ 風     │                                   └───────────────┘ │
│ │ 濕度   │                                                     │
│ │ ☑ 測站 │                                                     │
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
- **Compact screens** (phones, either orientation): the layer list becomes a 4 × 2 grid of buttons on an upright phone (seven 44 px targets do not fit its width in one row) and one row on its side, the stations toggle moves next to the legend, and the legend row hides while a card is open.
- The **timeline never leaves the screen**. The region that shrinks and scrolls is the layer list / station card. A phone in landscape leaves ~300 px under the browser's bars; the title hides below 360 px of height.
- Every control is at least 44 × 44 px, keyboard reachable, and labelled for screen readers (the legend is an `img` with a sentence as its label).

Interaction:

- One layer at a time; the legend names it and says in one sentence what it shows ("雷達：目前哪裡在下雨").
- The timeline **follows the newest data** until the visitor scrubs; "即時" lights up while following, "回到最新" brings it back. Dragging to the right end also resumes following. "Newest" means the last frame at or before now: for the wind forecast that is not the last frame, since the slider runs on 3.5 days past it into the forecast ("6 小時後"), and "即時" never shows the future.
- **Play** from the newest frame replays the recent loop (3 h; the whole day for the hourly temperature layer) rather than the whole week. From anywhere else it plays forward; on the wind layer that means through the forecast, and the end of it returns to the present.
- Keyboard: Space play/pause, ← → step. When the map itself has keyboard focus (reached by Tab) the arrows pan the map instead.
- Clicking a station opens its card; the card's readings follow the timeline, and its chart shows the 24 h around the map time.
- On the forecast layer the timeline is the week ahead, a day per frame ("今天", "明天", "3 天後"), 即時 is today, and the station dots stay off. The card opens on 臺北市 as soon as the layer is picked; tapping a county on the map or picking one from the card's list changes it, and the chosen county is outlined white. The chart marks the timeline's day with the dashed line and the table stresses it.
- Status messages (loading, no data for this time, request failed) appear as one line inside the timeline panel, with a Retry button when retrying can help.

---

## 3. Weather Layers and Data Sources

| Layer | What it shows | CWA dataset | Cadence | How it reaches the screen |
|---|---|---|---|---|
| 溫度 Temperature | Air temperature grid, land only | `O-A0038-003` (0.03°, 67 × 120) | hourly | grid → rg16 PNG frame → coloured in the browser |
| 雨量 Rain | Radar-estimated rainfall of the past hour | `O-B0045-001` (0.0125°, 921 × 881) | 10 min | same as temperature |
| 雷達 Radar | Composite reflectivity picture (dBZ) | `O-A0058-005` (PNG, 3600²) | 10 min | copied to Storage as-is, resampled in the browser |
| 衛星 Satellite | Himawari infrared colour cloud picture, coastlines drawn in | `O-C0042-002` (JPG, 800²) | 10 min | same as radar; no legend, the picture has no scale to read |
| 風 Wind | 10 m wind of CWA's WRF 3 km forecast, 0 to +84 h: speed as colour, direction as moving particles | `M-A0064` (GRIB2, 1158 × 673 Lambert grid, ~180 MB per lead time) | 6 h, four runs a day; hourly on the timeline, blended in between | the two wind fields are range-read and decoded in the API → uv8 PNG frame → coloured and animated in the browser |
| 濕度 Humidity | Relative humidity | station observations (no CWA grid exists) | 10 min | interpolated in the browser (§13) |
| 預報 Forecast | Each county's forecast temperature for the week ahead: the average of the day's high and low, on the temperature ramp | the township 7-day forecast below, one township per county | 6 h (CWA); refetched every 30 min | 22 forecasts fetched by the browser through `/api/forecast`, painted onto the county outlines (§13) |

Station data:

| Purpose | CWA dataset | Notes |
|---|---|---|
| Automatic weather stations | `O-A0001-001` | also the only station dataset with a usable history API (24 hourly snapshots) |
| Rain gauges | `O-A0002-001` | |
| Staffed (manned) stations | `O-A0003-001` | the ones people know: 臺北, 臺中, 高雄… |
| Township 7-day forecast | `F-D0047-003 … -087` (one dataset per county, every 4th id) | 12-hourly periods; rain probability for the first 3 days only |

The three station datasets overlap (2,581 records, 1,365–1,367 unique stations); later datasets win on metadata. CWA publishes observations about 15 minutes late, and the radar picture 8–10 minutes after its frame time.

Two overlays are drawn over whichever layer is up, both proxied live like the forecast (§7, §13): typhoons (`W-C0034-005`, every active tropical cyclone with CWA's past fixes, wind radii and forecast positions) and county advisories (`W-C0033-001` per county, `W-C0033-002` for the text: 大雨, 豪雨, 陸上強風, 低溫, 濃霧…). The county outlines for the advisories are a static file, `apps/web/public/counties.json`: the 22 counties from taiwan-atlas (MIT, Ministry of the Interior boundaries), arcs simplified to 0.001° and named as CWA names them (臺, not 台), 154 KB.

---

## 4. High-Level Architecture

```text
                 ┌─────────────────────┐
                 │   CWA Open Data     │  REST datastore (stations, forecast)
                 │                     │  file API → public S3 (grids, radar and satellite pictures)
                 │                     │  public S3, range requests (WRF wind GRIB2)
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

Deliberately absent: Turborepo, a `packages/` layer, Python/ecCodes GRIB tooling (a 120-line reader in `lib/grib.ts` covers the one product used, §9), a client-side state library (a 70-line `useSyncExternalStore` store is enough), and `supabase-js`.

---

## 6. Repository Structure

```text
.
├── api/index.ts                 Vercel function entry: re-exports the Hono handler
├── apps/
│   ├── web/                     React + MapLibre frontend
│   │   ├── public/counties.json the 22 county outlines for the advisories (taiwan-atlas, MIT)
│   │   └── src/
│   │       ├── api.ts           typed fetchers for /api, 7-day window, observation cache
│   │       ├── layers.ts        the six layers: frames source, cadence, loop, kind, legend
│   │       ├── ramps.ts         colour ramps and MapLibre colour expressions
│   │       ├── i18n.ts          every string, Taiwan-time formatters
│   │       ├── status.ts        the status line's messages and actions
│   │       ├── components/      LayerPanel, Legend, Warnings, Typhoons, StationCard, CountyCard, ForecastTable, WeekChart, Sparkline, chartData, hooks (the cards' forecast fetch and Escape)
│   │       ├── map/             MapView, basemap filter, useWeather (surface + stations + overlays + playback)
│   │       │   └── layers/      grid decode/paint, wind particles, IDW, station dots + zoom thinning, county forecast, typhoon and advisory overlays
│   │       └── timeline/        Timeline UI, store, keyboard shortcuts
│   └── api/                     Hono API
│       ├── src/
│       │   ├── app.ts           routes + error handling
│       │   ├── routes/          public routes, query schemas
│       │   ├── cwa/             CWA client, station normaliser, forecast normaliser
│       │   ├── ingestion/       stations (+ backfill), grids + pictures (radar, satellite), wind (GRIB2 by range request), frame prune
│       │   ├── db/              Drizzle schema, client
│       │   ├── lib/             grid parsing, GRIB2 reader, PNG encoder, Storage calls
│       │   └── middleware/      bearer auth for /internal
│       ├── scripts/             db-push, cron-secrets, cron-status, backfill, prune-check
│       └── drizzle.config.ts
├── supabase/migrations/         generated schema SQL + hand-written cron/prune/RLS SQL
├── docs/screenshots/            README pictures
├── .github/workflows/ci.yml
├── Taskfile.yml                 every operator command
└── vercel.json                  build, rewrites, security headers
```

Tests (`*.test.ts`) sit next to the code they test and run with Node's built-in runner: station/forecast normalisation, grid parsing, the GRIB2 reader (against the first 4 KB of a real WRF message, kept as a fixture), the wind resampling and encoding, query validation, the timeline store, request ordering, IDW, time formatting, the forecast layer's daily frames, representative townships and county colours.

---

## 7. API

All public routes are read-only `GET`s under `/api`, JSON, and every response carries `Cache-Control: public, s-maxage=…, stale-while-revalidate=…` so Vercel's CDN serves repeats. Times are ISO-8601 with an offset (`2026-10-09T14:00:00+08:00` or `…Z`); invalid parameters get `400` with a message.

| Route | Returns | CDN |
|---|---|---|
| `GET /api/health` | `{ ok, db }` — database reachable? | none |
| `GET /api/stations` | all stations: id, CWA id, name, county, town, WGS84 position, elevation | 1 h |
| `GET /api/stations/:cwaId/history?from=&to=` | one station's observations in the range (default last 24 h, max 12 days; instants snapped to whole hours) | 60 s |
| `GET /api/observations?at=` | every station's reading at one instant (`at` snapped down to the 10-minute grid): per field, the newest non-null value in the 100 min before it (stations report at different cadences) | 60 s |
| `GET /api/forecast?county=&town=` | a township's 12-hourly periods for the coming week; proxied live from CWA, nothing stored; only townships that have a station are accepted | 30 min |
| `GET /api/warnings` | the county advisories in force: phenomenon, period, the counties under it and CWA's text; proxied live, nothing stored | 5 min |
| `GET /api/typhoons` | every active tropical cyclone: past fixes, the current one with 15/25 m/s wind radii, forecast fixes with the 70 % probability radius; proxied live from CWA, nothing stored | 10 min |
| `GET /api/frames?layer=&from=&to=` | the timeline contract: `[{ time, url?, bounds?, meta? }]` for `stations`, `radar`, `satellite`, `rain-grid`, `temperature-grid` or `wind`; a range of up to 12 days, widened to whole hours | 60 s |

The **frames contract** is the one shape every layer answers in. Station frames are a synthetic 10-minute grid clipped to what is stored (no URL: the browser asks `/observations` per frame). Grid and picture frames carry the Storage URL and the WGS84 bounds; encoded grids also carry their decoding recipe in `meta`. Wind frames are the same shape with times that run past now (the browser asks for `to` = now + 4 days for that layer only) and a `meta` that also names the model run.

Internal routes are `POST`, require `Authorization: Bearer $INGESTION_SECRET`, and are called by Supabase Cron:

| Route | Does |
|---|---|
| `/api/internal/ingest/stations` | fetch the three station datasets, upsert stations, insert observations |
| `/api/internal/ingest/grids[?layer=]` | temperature grid, rain grid, radar and satellite pictures → Storage + `weather_frames`; `layer=` runs one |
| `/api/internal/ingest/wind` | the 15 WRF lead times: each file's header is read, and a file from a newer run than the stored frame is decoded and stored; stops after 40 s and reports `done: false`, the next call continues |
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
  id serial PK · layer_type text (radar | satellite | rain-grid | temperature-grid | wind) · valid_at timestamptz
  storage_path text · min_lat, max_lat, min_lon, max_lon double · metadata_json jsonb · created_at
```

Also in the database, outside the schema Drizzle manages (hand-written migrations):

- `private.trigger_ingest(path)` — `security definer`, empty `search_path`, reads `api_base_url` and `ingestion_secret` from Vault and `net.http_post`s to the API. Execute revoked from `public`.
- `private.prune(fine, hourly)` — the nightly retention job (§11); writes one row per night to `private.db_size_log` (database size, row counts, rows thinned/expired).
- `cron.job` rows for the six schedules (§10).

Upserts are idempotent: observations conflict on `(station_id, observed_at)` and a later run never blanks a reading an earlier one stored (`coalesce(excluded.col, existing.col)`); frames conflict on `storage_path`. Every ingestion call can be repeated safely. Wind keeps **one row per valid time** whatever the model run: a newer run updates the row to its new file in place (so `/frames` never sees two frames at one time) and then deletes the older file.

---

## 9. Storage and Frame Encoding

Bucket `weather-data` (public read, PNG and JPEG only, 5 MB per file). Paths embed the frame time, so a path's content never changes and files are uploaded with `Cache-Control: max-age=31536000, immutable`:

```text
temperature-grid/2026/10/09/0600Z.png     ~6 KB
rain-grid/2026/10/09/0600Z.png            ~4 KB
radar/2026/10/09/0600Z.png                CWA's own PNG, ~100 KB
satellite/2026/10/09/0600Z.jpg            CWA's own JPG, ~90 KB
wind/2026/10/09/0000Z/006.png             run 00Z, lead time +6 h: ~130 KB (the run is in the path, so a newer run is a new file)
```

**rg16 encoding.** A float grid becomes a PNG whose pixels carry the value, not a colour: `value16 = round((v + offset) × scale)`, red = high byte, green = low byte, alpha = 255 where valid and 0 for "no data" (sea, outside coverage). Temperature uses offset 50 / scale 100 (0.01 °C steps), rain offset 0 / scale 10 (0.1 mm steps). The recipe is stored in `metadata_json` and returned as `meta`, so the browser decodes any frame without knowing the layer. Colouring happens in the browser, which means a ramp can change without re-ingesting anything.

**uv8 encoding (wind).** A 400 × 334 lat/lon crop of the WRF field, 115–127°E / 19–29°N at 0.03° (the model's own 3 km spacing), values at cell centres, north-up: red = (u + 64) × 2, green = (v + 64) × 2 (0.5 m/s steps, ±64 m/s), blue = speed × 4 (0.25 m/s steps to 63.75), alpha 255 (0 outside the model domain, which the crop never leaves). `meta` carries `{ encoding: 'uv8', width, height, run }`. The browser reads u and v for the particles and the speed for the colour. Half a metre per second is below what a map shows and a quarter of the station readings' resolution.

**Reading the GRIB2.** CWA's WRF file is 78 messages of one Lambert conformal grid (template 3.30: 1158 × 673, LoV 120°E, standard parallels 10° and 40°, 3 km), all in 24-bit simple packing (template 5.0) without a bitmap, and the 10 m U and V are two of them. The file is never downloaded: the first 256 bytes of each message are read by HTTP `Range` until both wind messages are found (they are the 67th and 68th, but one accumulated-rain message and a few 8-bit ones shift their offsets between files; the previous file's offsets are tried first and usually hit), then their two 2.3 MB data sections. Every read after the first carries `If-Match` with the file's ETag, so a file CWA replaces mid-way answers 412 and the lead time waits for the next call instead of mixing two runs. `lib/grib.ts` parses sections 0–6, unpacks any bit width, and projects latitude/longitude onto the grid with Snyder's secant-cone formulas; the sampling of the crop is bilinear. Every length is bounded (message ≤ 64 MB, data ≤ 4 MB, ≤ 4 M points, sections within the bytes read) and anything but this one shape throws. One finding: GRIB says "shape 6" (a 6,371,229 m sphere), but WRF runs on 6,370,000 m, and only with that radius does CWA's documented far corner land on the last grid point — the difference is 0.2 cells, or 600 m, at the far corner.

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
| `ingest-wind` | every 30 min at :00, :30 | `/api/internal/ingest/wind` |
| `prune` | daily 03:30 | `private.prune(7 days, 7 days)` in SQL |
| `prune-frames` | daily 03:40 | `/api/internal/prune/frames` |

Design points:

- **Each product is independent.** `ingestGrids` runs the four products with `Promise.allSettled`; `ingestStations` fetches its three datasets the same way. One CWA hiccup costs one product for one cycle, never the whole cycle — and 10-minute readings CWA never serves again.
- **Radar is fetched twice per cycle** because CWA only ever serves the latest picture and publishes it 8–10 minutes after frame time; a single :08 fetch missed 23 of 143 frames a day, the extra :03 fetch brought that to ~2.
- **The radar and satellite pictures' URLs come from CWA documents**, so they are treated as untrusted: only `https://cwaopendata.s3.ap-northeast-1.amazonaws.com/` is fetched, redirects are refused, the file is capped at 5 MB and must start with the PNG or JPEG signature the product promises.
- **Wind runs on a budget, not a schedule of its own.** CWA runs WRF four times a day and uploads the 15 files over about 1.5 h, from ~5 h after the run (the 00Z files appeared 04:58–06:20 UTC on 2026-10-09). Every 30 min the API reads each file's first message (its run time), skips the lead times whose stored frame is from that run or newer, and decodes the rest in order until 40 s are spent; a call that runs out answers `done: false` and the next one carries on, so a new run is complete within the hour after its last file. A full lead time takes about a second in Tokyo (the header walk is ~67 small reads on the same S3 region; from Taiwan it took 7 s); the function's limit is 60 s (`vercel.json`). The lead times are independent like the other products: one unreadable file is logged and skipped.
- **Upload before insert.** A `weather_frames` row must never point at a missing file; an orphan file is invisible, an orphan row would be a broken frame.
- **Backfill** exists only for automatic stations (`O-A0001-001` keeps 24 hourly XML snapshots). It is driven in batches of a few files per call so one call fits a function invocation.
- Every CWA call has a timeout (10–45 s) and every response is validated with zod before anything is written; one malformed station record is skipped and counted, not fatal.

---

## 11. Retention and Capacity

The free tier allows 500 MB of database and 1 GB of Storage. Measured: ~193k observation rows a day at ~240 B (with indexes) ⇒ about 46 MB/day; frames ~456/day, of which radar (~100 KB) and satellite (~90 KB) are nearly all the bytes.

Policy, since 2026-10-09: **every station reading and every frame is kept for 7 days**, which is exactly what the timeline plays back. Steady state ≈ 325 MB of database (plus a 12 MB empty baseline) and ≈ 200 MB of Storage. Wind adds one ~130 KB frame per 6 h plus the 3.5-day forecast, about 42 files and 6 MB in all; superseded runs are deleted as they are replaced, not by the prune.

- `private.prune(fine, hourly)` deletes observations older than the windows in one statement (the previous policy thinned 3–60-day-old rows to hourly; with both windows at 7 days that step is a no-op by design, and the function still supports it).
- `pruneFrames` deletes files first, then rows, at most 1,000 per night (about three days' worth, so a backlog clears in a few nights).
- The nightly job logs the database size to `private.db_size_log`; `task cron:status` prints the last week.
- `scripts/prune-check.mjs` rehearses a retention change inside a transaction that is always rolled back, reporting how many rows it would keep, thin and expire.

Changing the windows is a migration that re-runs the `cron.schedule` line, never a dashboard edit.

---

## 12. Timeline

One store (`timeline/store.ts`) owns the timeline for every layer: the active layer, its frames, the cursor, play state, speed, follow-latest, and which station is selected. Components read it with `useSyncExternalStore`; the map hook writes frames into it.

```text
layer changes ──▶ request++ ──▶ GET /frames?layer=…&from=<now − 7 d, rounded down to the hour>[&to=<now + 4 d> for wind]
                                    │
                        setFrames(layer, token, frames)   ← ignored if the layer or token moved on
                                    │
              follow-latest ? index = last frame ≤ now : index = last frame ≤ previous cursor time
```

`latestIndex` is the last frame at or before now, with no tolerance (a wind frame minutes ahead has no station readings yet, so the dots would vanish at 即時 for half of every hour): simply the last frame for every layer that only has the past; for the wind forecast the slider continues 3.5 days past it. Following it means that, as time passes, the re-poll moves the viewer to the next forecast frame the way it moves them to a new radar picture.

The forecast layer's frames are not fetched: `forecastFrames()` makes seven, one per Taiwan day from today, each at the day's midnight, so today is always the frame at or before now and 即時 means today. The Timeline shows that layer as a date with "今天 / 明天 / 3 天後" instead of a clock and a minutes-ago, and "今天起 7 天 · 一天一格" instead of a cadence (CWA reissues the forecast every 6 h, which is the layer's `everyMin`; the frames are a day apart).

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

**Wind.** CWA's frames are 6 h apart; the timeline steps hourly. The frames in between are made in the browser (`map/layers/wind.ts`): u and v blended linearly from the two real frames around them, the speed that of the blended vector, so a drag through the forecast flows instead of jumping and 即時 is within the hour of now. The uv8 frame is decoded like a grid; its speed goes through `paint` with the wind ramp (Windy's blue → green → yellow → red → purple) as the surface, and its u/v drive particles on a 2D canvas that the map shows as a canvas source pinned to the four corners of the current view — a raster layer under the advisories, typhoons, station dots and place names: ~1 per 900 screen pixels (at most 2,500), each a position and an age, moved every animation frame by the u/v under it (0.09 px per m/s, the same at every zoom), drawn as a 1.2 px white segment, and respawned at random when it ages out, leaves the field or lands on a missing cell. The trails cost nothing: the canvas keeps 93 % of its own alpha each frame (`destination-in`) before the new segments go on. Screen → world is the linear Mercator mapping of the map's current bounds, so the map never rotates or pitches (both are disabled; nothing here needed a turned map). While the map moves the particles pause, the canvas clears and the source stops uploading; when it settles the source is pinned to the new view and the particles reseed. While the source plays the map repaints every animation frame, as every wind map does; a `CustomLayerInterface` drawing the streaks itself would save the per-frame texture upload if a phone ever minds. `prefers-reduced-motion` gets the coloured surface and no particles. For frames ahead of now there are no readings, so the dots carry the forecast instead: the field's speed under each station that reported wind at the newest observation (rain gauges stay off), drawn inverted — dark with a light ring — so a model value never passes for a reading; they wait for the frame's field to be on the map, keeping the previous dots until then.

**Humidity.** No CWA grid exists, so the station readings are interpolated in the browser with inverse-distance weighting (1/d²) onto the latest temperature grid's land cells, which gives Taiwan's outline for free. ~3.5k land cells × ~1.2k stations ≈ 4M distances, ~20 ms. A k-nearest index is the upgrade if either count grows 10×.

**Stations.** Drawn as a GeoJSON source with a circle layer (colour from the ramp) and a symbol layer (the value with its unit as a sign: 28.3°, 85%, 12.0 mm, 5.1 m/s). Zoomed out, only the most relevant stations are shown at least 56 px apart — room for the widest label, so a drawn dot always has its value (at 44 px, measured, one label in eight was lost to collisions at zooms 9–10); each zoom level from 5 to 11 adds the next most relevant ones that fit, computed once per frame in `minZooms()` and stored as a per-feature `minzoom` that the layer filter compares with the zoom. Relevance: staffed stations (`46…`) before automatic (`C0…`) before the rest, lower elevation first (the town over the peak above it); for rain, the wettest first, and dry gauges are not drawn at all. Labels blinked ~400 ms per step until two fixes: the map's `fadeDuration` is 0 (a label whose text changed counts as new and would fade in), and the previous frame's stations stay up until the next frame's replace them. The same keep-until-replaced rule holds for the station card, which otherwise blanked on every playback step.

**Forecast.** No surface: the county outlines (the same static file the advisories use) are a GeoJSON fill under the roads and place names, coloured by the temperature ramp's MapLibre expression from each feature's `avg`, with a thin dark border and a white outline on the county the card shows. Every county is always drawn: one without a number for the day (its fetch failed, or CWA's week stops short) is grey, so it is visibly not a temperature and still there to tap. The data is CWA's township forecast, already proxied for the station card: when the layer is up the browser fetches the 22 counties' representative townships through `/api/forecast` (in parallel, `allSettled` so one county failing leaves the others coloured) and each frame takes its day's extremes from the same "week ahead" the cards show (`upcomingWeek`: periods already over are dropped, so after 18:00 today is tonight on the map and in the card alike, and the week starts today, since before 06:00 the running night is filed under yesterday and would push the seventh day out). `getForecast` in `api.ts` keeps each township's week for the CDN's half hour, shared by the map, the county card and the station card, so the three never disagree and an open tab still follows CWA's 6-hourly updates; a failed fetch is kept until Retry as well, so a bad hour costs one request per township and not 22 per frame. Until the station list is there the frame is not shown at all (playback waits), since the townships come from it. The station dots and their toggle are off on this layer, which has no station variable: a reading on top of a week's forecast would be read as part of it. A county's township is its lowest station's (`countyTowns`), so 嘉義縣 reads as 東石鄉 on the plain rather than 阿里山鄉, and the card names it; CWA's county-level forecast dataset is the upgrade if the official county number ever matters. The card's chart is a 30-line SVG with both lines and every value printed, which seven points allow and a tooltip would only hide.

**Typhoons.** One GeoJSON source holds, per cyclone, the past track (solid), the forecast track (dashed), the fixes as dots (the current one orange and named, forecast ones labelled with their time), the 15 and 25 m/s wind radii at the current fix and the 70 % probability circles ahead; circles are 48-point rings on an equirectangular approximation. It sits above the weather and the coast clip (a track crosses the sea) and below the stations. The list is refetched every 10 minutes on its own clock. Storms are usually far off-screen, so a chip names each one; tapping it fits the track into the part of the screen the panels leave free (measured from the panels' edges, since an opened advisory changes them), or centres the storm there where the whole track cannot fit. The map's bounds were widened to CWA's basin (100–180°E, 0–50°N) for this. Playback hides the tracks (they are static, and the weather moving is the point) and, if the viewer had flown out to a storm, flies back to the opening view of Taiwan.

**Advisories.** The map draws nothing until the viewer opens one advisory in the panel; then its counties are painted from the static county file with a 22 % tint and a 3 px outline over a white casing, all in one hot pink that belongs to no layer's ramp (those run blue → green → yellow → red → purple, radar starts cyan), so the highlight stands out on the sea and on a bright temperature field alike. The counties are also brought into view; opening the row again clears it. The layer sits between the coast clip and the typhoons. The list is refetched every 5 minutes; the county file is fetched the first time an advisory is opened. The panel names each advisory with its county count, end time and a dot in CWA's severity colours (rain advisories blue → orange → red → purple, strong wind yellow, low temperature light blue, fog grey), and opens to the county list and CWA's text. The advisory and typhoon chips form one scrolling group: top-right on roomy screens (hidden while a station card is open, which needs the column's full height at 1280×800), under the layer row on phones, and not at all on a phone on its side, where the outlines on the map have to do.

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
- `maxDuration: 60` for that function: the wind ingest spends up to 40 s per call, the other routes answer in well under a second
- Region `hnd1` (Tokyo), next to the Supabase project and to CWA's S3 bucket
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
| Every query parameter validated with zod before it reaches SQL, logs or CWA: ISO instants snapped to the data's grid (10 min for `at`, whole hours for ranges), 12-day range cap, station id `^[A-Za-z0-9]{4,12}$`, county from a fixed list, township shape **and** must belong to a station | `routes/query.ts`, `routes/public.ts` |
| All SQL parameterised through Drizzle; the one `sql.raw` uses hard-coded column names | `routes/public.ts` |
| The forecast proxy cannot be pointed elsewhere: fixed host, dataset from the county map, township URL-encoded | `cwa/client.ts`, `cwa/forecast.ts` |
| The radar and satellite fetches only follow CWA's own S3 host, no redirects, 5 MB cap, PNG/JPEG signature checked | `ingestion/grids.ts` |
| The wind files are read from a URL built from a fixed host and a number, by range, `206` or nothing; the GRIB2 reader bounds every length it trusts (message, data section, point count, section sizes) and refuses any layout but the one product's | `ingestion/wind.ts`, `lib/grib.ts` |
| Generic error bodies; details only in server logs | `app.ts` |
| Postgres: TLS enforced, RLS on every table with no policies, cron functions `security definer` with empty `search_path` in a non-exposed schema, execute revoked from `public`, secrets in Vault | migrations |
| Response headers on every route: `Content-Security-Policy` (`default-src 'self'`; connections only to the API, OpenFreeMap and Supabase Storage; `frame-ancestors 'none'`; no inline scripts or styles), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (Vercel) | `vercel.json` |
| Vercel WAF rate limit on `/api` (~600 requests/min per IP → 403) | Vercel dashboard |
| CI: read-only token, actions pinned to SHAs; pnpm: no package younger than 7 days, no git/tarball sub-dependencies, overrides for advisories in build-only tools; `pnpm audit` clean | `.github/workflows/ci.yml`, `pnpm-workspace.yaml` |
| GitHub secret scanning, push protection and Dependabot alerts on; nothing sensitive in the history (gitleaks) | repository settings |
| Scanned 2026-10-09 (twice): gitleaks, semgrep (typescript, javascript, react, nodejs, secrets, owasp-top-ten, github-actions packs), `pnpm audit`, osv-scanner, trivy — no findings; a trust-boundary review found two low items, the query snapping above (fixed) and the certificate limit below | — |

Known limits, accepted for this project:

- The API connects as the database owner. A dedicated role with `SELECT/INSERT/DELETE` on three tables would contain a future injection; there is none today.
- `ssl: 'require'` encrypts but does not verify Supabase's certificate. The pooler's chain ends in Supabase's own CA (measured 2026-10-09: `verify-full` fails with `SELF_SIGNED_CERT_IN_CHAIN`), so verification needs the CA file from the dashboard's database settings passed as `ssl: { ca }` in `db/client.ts` and `sslrootcert` in the scripts; until then an active man-in-the-middle on the Vercel–Supabase path could read traffic. Not a passive risk.
- Any distinct query string is a CDN miss, so instants are snapped to the data's grid before they are used (`routes/query.ts`): the set of distinct queries is finite, and a caller walking milliseconds hits the CDN, not the database. Queries are indexed and bounded, and the WAF caps volume.
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

## 20. Dropped from the Plan

| Feature | Status | Why |
|---|---|---|
| Lightning | dropped 2026-10-09 | `O-A0039-001` is a KMZ of the past hour's strikes; every file fetched during the day held none, so the placemark format was never seen and nothing could be built against it. The project is complete without it |
| Forecast history (forecast vs. actual) | dropped 2026-10-09 | `forecast_runs` / `forecast_values` were designed for it and removed unused; the township forecast and typhoons are live proxies that keep no versions (§21). Nobody asked to score CWA's forecasts, so there is nothing to build until someone does |

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
- **2026-10-09** County advisories shipped the same way. County polygons come from taiwan-atlas rather than g0v's twgeojson (2010 names, 766 split geometries) and are simplified on the TopoJSON arcs, so shared borders stay shared and neighbouring counties never show slivers.
- **2026-10-09** Wind shipped from the API itself rather than the planned GitHub Actions + ecCodes pipeline: probing the WRF file with range requests showed one Lambert grid, plain 24-bit simple packing and no bitmap, which a 120-line reader handles, so no Python, no Actions and no secrets outside the platform. The timeline gained a forecast: "latest" became the last frame at or before now, and frames may lie ahead of it. Particles went on a 2D canvas instead of WebGL — a few thousand segments a frame need no shader.
- **2026-10-09** Station dots carry the forecast ahead of now (the field's speed at each anemometer station, drawn inverted) after the user watched them vanish the moment playback entered the forecast; the alternative, a note saying there are no readings, explained the gap without filling it.
- **2026-10-09** Evening review pass: query instants snapped to the data grid (an unbounded CDN key space was the one load finding of the security review); station labels carry their unit and the station spacing grew to 56 px after measuring one label in eight lost to collisions; a repo-wide audit cut unused fields the typhoon and forecast proxies shipped, duplicated helpers and the pnpm-script layer under the Taskfile.
- **2026-10-09** Wind timeline made hourly by blending the 6-hourly frames in the browser (what the plan called the shader lerp, done in a loop of 134k cells instead), and the particle canvas moved under the labels by showing it as a canvas source pinned to the view rather than a `CustomLayerInterface`: the source MapLibre already has does the upload and the ordering.
- **2026-10-10** Forecast layer added (the course assignment's core deliverable: a region picked from a list, its week as a high/low chart and a table, a map coloured by a chosen day's forecast). Built as a seventh layer so the timeline is the date picker and the legend, playback and cards all come for free, on the township forecast proxy and county outlines already there: no new API route, no stored forecast. Counties are represented by a lowland township rather than a county-level CWA dataset, which would have meant a new normaliser for one number. The phone's layer row became a 4 × 2 grid when the seventh 44 px button no longer fit.

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
