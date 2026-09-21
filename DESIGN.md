# Taiwan Weather Map — System Design

## 1. Project Summary

Build a Windy-style weather visualization website focused on **Taiwan and the surrounding sea**.

The primary data source is the **Central Weather Administration (CWA) Open Data API**.

The application should provide:

- Interactive map-first UI
- Weather layer switcher
- Animated wind particles
- Radar animation
- Historical weather playback
- Forecast timeline
- Weather station observations
- Temperature / humidity / rainfall visualization
- Lightning visualization
- Satellite imagery
- Typhoon tracks
- Weather warnings
- Automatic deployment from GitHub
- Persistent historical weather data

The project should be designed so it can later expand into:

- User accounts
- Saved locations
- Alerts / notifications
- Mobile clients
- Forecast-vs-actual analytics
- Additional weather sources
- Data science / ML features

---

# 2. Core Product Experience

The application is primarily a **full-screen interactive map**, not a traditional dashboard.

Example layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Weather Taiwan                              Search / Time   │
│                                                            │
│ ┌──────────────┐                                           │
│ │ Wind         │                                           │
│ │ Radar        │            Animated Map                   │
│ │ Rain         │                                           │
│ │ Temperature  │                Taiwan                     │
│ │ Humidity     │                                           │
│ │ Lightning    │                                           │
│ │ Satellite    │                                           │
│ │ Typhoon      │                                           │
│ │ Warnings     │                                           │
│ └──────────────┘                                           │
│                                                            │
│  ◀  ━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━  ▶               │
│      Past             Now               Forecast           │
│                                                            │
│               Play / Pause / Speed                         │
└────────────────────────────────────────────────────────────┘
```

The timeline should work across layers whenever the source data supports time-based playback.

---

# 3. Weather Layers

Initial supported layers:

1. Wind
2. Radar
3. Rain
4. Temperature
5. Humidity
6. Lightning
7. Satellite
8. Typhoon
9. Warnings

Recommended MVP priority:

1. Map foundation
2. Temperature
3. Rain
4. Humidity
5. Weather stations
6. Radar playback
7. Historical timeline
8. Wind particles

Then add:

- Lightning
- Satellite
- Typhoon
- Warning polygons
- Forecast-vs-actual comparison

---

# 4. High-Level Architecture

```text
                         ┌────────────────────┐
                         │      CWA API       │
                         └─────────┬──────────┘
                                   │
                         ┌─────────▼──────────┐
                         │                    │
                         │    Backend API     │
                         │ Hono + TypeScript  │
                         │                    │
                         │   Vercel Runtime   │
                         └─────────┬──────────┘
                                   │
                              Drizzle ORM
                                   │
               ┌───────────────────┴────────────────────┐
               │                                        │
               ▼                                        ▼
    Supabase PostgreSQL                       Supabase Storage
               │                                        │
        structured/history                        large files
               │                                        │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼
                           React + Vite
                                   │
                              MapLibre GL
                                   │
                              WebGL layers
                                   │
                                   ▼
                                Vercel
```

Additional scheduled processing:

```text
Supabase Cron
     │
     └─────────────── HTTP ────────────────▶ Backend ingestion endpoints
```

Heavy numerical-model processing:

```text
GitHub Actions
      │
      ▼
Python
ecCodes / cfgrib
xarray / numpy
      │
      ▼
Supabase Storage + PostgreSQL metadata
```

---

# 5. Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- MapLibre GL JS
- WebGL
- Motion or CSS animation

## Backend

- Hono
- TypeScript
- Vercel Functions / Vercel server runtime

## Database

- Supabase PostgreSQL
- Drizzle ORM
- Drizzle Kit

## Database Migration

- Drizzle schema definitions
- Drizzle Kit migration generation
- Supabase CLI migration application
- SQL migrations committed to Git

## Object Storage

- Supabase Storage

Used for:

- Radar images
- Satellite images
- Raw GRIB2 files
- Processed wind-field files
- Other binary / raster weather products

## Scheduled Data Ingestion

- Supabase Cron
- Backend internal ingestion endpoints

## Heavy Data Processing

- GitHub Actions
- Python
- ecCodes
- cfgrib
- xarray
- numpy

## Deployment

- GitHub
- Vercel Git integration
- Automatic deployment on push

---

# 6. Repository Structure

Recommended monorepo structure:

```text
weather-taiwan/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── components/
│   │   ├── map/
│   │   │   ├── layers/
│   │   │   └── controls/
│   │   ├── timeline/
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── ingestion/
│       │   ├── middleware/
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── db/
│   │   ├── schema/
│   │   ├── client.ts
│   │   └── repositories/
│   │
│   ├── cwa-client/
│   │
│   ├── weather-core/
│   │
│   └── shared/
│
├── pipeline/
│   └── grib/
│       ├── ingest_wrf.py
│       ├── extract_wind.py
│       └── requirements.txt
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── ingest-wrf.yml
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

Recommended workspace tooling:

- pnpm
- Turborepo

---

# 7. Backend Responsibilities

The backend is the only public application layer allowed to directly coordinate business logic.

The frontend should **not access PostgreSQL directly**.

Backend responsibilities:

- Call CWA APIs
- Normalize CWA response formats
- Read/write PostgreSQL
- Read/write Supabase Storage
- Serve history queries
- Serve timeline frame metadata
- Protect CWA API credentials
- Provide internal ingestion endpoints
- Aggregate data for frontend use
- Hide storage/database implementation details

Example API structure:

```text
/api/weather
/api/stations
/api/stations/:id
/api/stations/:id/history
/api/radar
/api/radar/history
/api/wind
/api/wind/frames
/api/forecast
/api/lightning
/api/satellite
/api/typhoons
/api/warnings

/api/internal/ingest/stations
/api/internal/ingest/radar
/api/internal/ingest/lightning
/api/internal/ingest/forecast
```

Internal ingestion routes must be protected by a secret token.

---

# 8. Database Design

## stations

```text
id
cwa_station_id
name
county
town
latitude
longitude
elevation
created_at
updated_at
```

Possible later improvement:

- PostGIS `geography(Point)` location column

---

## station_observations

```text
id
station_id
observed_at
temperature
humidity
pressure
wind_speed
wind_direction
gust_speed
rain_1h
rain_24h
created_at
```

Recommended indexes:

```text
(station_id, observed_at DESC)
(observed_at DESC)
```

---

## forecast_runs

Represents one version of a forecast issued at a particular time.

```text
id
dataset
issued_at
created_at
```

---

## forecast_values

```text
id
run_id
location_id
valid_at
temperature
humidity
wind_speed
wind_direction
rain_probability
weather_code
created_at
```

Important distinction:

```text
issued_at = when CWA produced the forecast
valid_at  = the future time the forecast applies to
```

This enables future forecast-vs-actual analysis.

---

## weather_frames

Metadata index for binary/raster data stored in Supabase Storage.

```text
id
layer_type
observed_at
issued_at
valid_at
storage_path
min_lat
max_lat
min_lon
max_lon
metadata_json
created_at
```

Possible values for `layer_type`:

```text
radar
satellite
wind
rain-grid
```

---

## warnings

```text
id
cwa_warning_id
warning_type
issued_at
expires_at
title
description
geometry
raw_json
created_at
```

---

## typhoon_tracks

```text
id
typhoon_id
observed_at
latitude
longitude
pressure
max_wind_speed
movement_direction
movement_speed
is_forecast
forecast_lead_hours
created_at
```

---

# 9. PostgreSQL vs Storage

## PostgreSQL stores structured/queryable data

Examples:

- Temperature
- Humidity
- Pressure
- Rainfall
- Wind observations
- Station metadata
- Forecast values
- Warning metadata
- Typhoon positions
- Storage file indexes

Use PostgreSQL when we need queries such as:

```text
Give me all observations from Taichung between two dates.

Calculate average temperature per hour.

Return the latest forecast run.

Find all warnings active at a specific time.
```

---

## Supabase Storage stores large files

Examples:

```text
radar/2026/09/21/1830.png
satellite/2026/09/21/1830.png
grib/2026/09/21/wrf.grib2
wind/2026/09/21/12z/f006.bin
```

Do not store these files as PostgreSQL BLOB/BYTEA unless there is a specific reason.

---

# 10. History Strategy

The project will persist historical data from the time ingestion is enabled.

Two important history categories:

## Observation History

Actual measurements.

Examples:

- Temperature
- Humidity
- Rain
- Station wind
- Radar
- Lightning
- Satellite

## Forecast History

Each forecast version should be stored instead of overwriting the previous one.

This allows future features such as:

```text
Forecast issued yesterday:
30°C

Updated forecast:
29°C

Actual:
28.5°C
```

This can later support forecast accuracy analysis.

---

# 11. Wind Data Pipeline

Wind particles require gridded vector data.

The preferred source is a CWA numerical weather model containing:

```text
U wind component
V wind component
```

Processing flow:

```text
CWA GRIB2
    │
    ▼
GitHub Action
    │
    ▼
Python processor
    │
    ├── read GRIB2
    ├── extract U component
    ├── extract V component
    ├── crop Taiwan + surrounding sea
    ├── downsample if required
    ├── encode compact binary format
    │
    ▼
Supabase Storage
    │
    ▼
weather_frames metadata
    │
    ▼
Frontend
    │
    ▼
WebGL texture / particle simulation
```

Example processed files:

```text
wind/
└── 2026/
    └── 09/
        └── 21/
            └── 12z/
                ├── f000.bin
                ├── f003.bin
                ├── f006.bin
                └── f009.bin
```

The browser should not download and parse the original GRIB2 file.

---

# 12. Timeline Design

Timeline should be a shared system, not implemented separately by each layer.

Example:

```text
Past                     Now                     Forecast
│                         │                         │
●────●────●────●────●─────●────●────●────●────●────●
```

Core controls:

- Scrub / drag
- Play
- Pause
- Playback speed
- Next / previous frame
- Current timestamp display

Each layer provides available frames:

```json
[
  {
    "time": "2026-09-21T18:00:00+08:00",
    "url": "..."
  },
  {
    "time": "2026-09-21T18:10:00+08:00",
    "url": "..."
  }
]
```

The timeline controller selects the appropriate frame.

---

# 13. Animation Strategy

## Wind

WebGL particle simulation using vector field data.

## Radar

Time-frame animation with smooth opacity interpolation.

## Satellite

Time-frame animation similar to radar.

## Lightning

Point markers with pulse / scale / fade effects.

## Temperature / Humidity / Rain

Continuous visual layer:

- color gradient
- raster/grid
- heatmap/interpolated surface

Transitions between time frames should animate smoothly when possible.

---

# 14. Migration Strategy

Database schema changes must be version controlled.

Do not manually modify the production database as the normal workflow.

Recommended process:

```text
1. Modify Drizzle schema
2. Generate migration
3. Review generated SQL
4. Commit migration to Git
5. Apply migration using Supabase CLI
6. Deploy application
```

Example:

```bash
pnpm drizzle-kit generate
supabase db push
```

Migration files:

```text
supabase/migrations/

202609210001_initial.sql
202609220001_add_weather_frames.sql
202609230001_add_indexes.sql
202609240001_enable_postgis.sql
```

Raw SQL migrations are acceptable and expected for:

- PostGIS
- Advanced indexes
- Views
- Materialized views
- Triggers
- RLS
- PostgreSQL-specific features

Production schema changes should not rely on `drizzle-kit push`.

---

# 15. Deployment

## Frontend + Backend

Hosted on Vercel.

GitHub integration:

```text
git push
   │
   ▼
GitHub
   │
   ▼
Vercel Build
   │
   ├── lint
   ├── typecheck
   ├── tests
   ├── build
   │
   ▼
Preview / Production
```

Recommended behavior:

```text
feature branches -> Vercel Preview Deployment
main             -> Production Deployment
```

---

# 16. CI

Recommended GitHub Actions workflow:

```text
Pull Request / Push

pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Optional:

```text
migration validation
```

Separate scheduled workflow:

```text
ingest-wrf.yml
```

for numerical-model processing.

---

# 17. Environment Variables / Secrets

Secrets should NOT be committed into Git.

Use:

- Vercel Environment Variables
- Supabase project secrets
- GitHub Actions Secrets

Local development should use `.env.local` or equivalent and it must be excluded by `.gitignore`.

---

## Required CWA Secret

```text
CWA_API_KEY
```

Source:

CWA Open Data Platform account.

This key should be stored server-side only.

Never expose it using a frontend-prefixed variable such as:

```text
VITE_CWA_API_KEY
```

---

## Required Supabase Values

### Public project URL

```text
SUPABASE_URL
```

Example:

```text
https://xxxxxxxx.supabase.co
```

### Server-side service role key

```text
SUPABASE_SERVICE_ROLE_KEY
```

This must never be exposed to the browser.

### PostgreSQL connection string

```text
DATABASE_URL
```

Use the Supabase PostgreSQL connection / pooler string appropriate for the backend environment.

Example form:

```text
postgresql://USER:PASSWORD@HOST:PORT/postgres
```

Do not commit the actual value.

---

## Storage Configuration

Create at least one Storage bucket.

Recommended:

```text
weather-data
```

Suggested structure:

```text
weather-data/
├── radar/
├── satellite/
├── grib/
└── wind/
```

Environment variable:

```text
SUPABASE_STORAGE_BUCKET=weather-data
```

---

## Internal Ingestion Secret

Create a random high-entropy secret:

```text
INGESTION_SECRET
```

Supabase Cron includes this when calling internal ingestion routes.

Example conceptual request:

```text
POST /api/internal/ingest/radar
Authorization: Bearer <INGESTION_SECRET>
```

---

## GitHub Actions Secrets

For the GRIB pipeline, GitHub Actions will need:

```text
CWA_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Potentially:

```text
DATABASE_URL
```

depending on whether the pipeline writes metadata through PostgreSQL directly or calls the backend API.

Preferred design:

```text
GitHub Action
    ↓
Backend internal endpoint
```

where practical, to reduce duplicated database logic.

However, direct upload to Storage may be necessary for large files.

---

# 18. Accounts / Resources That Need To Be Created

## 1. GitHub

Required:

- GitHub account
- GitHub repository

You need to provide / create:

```text
Repository URL
```

Example:

```text
https://github.com/<organization>/<repo>
```

Recommended repository name:

```text
taiwan-weather-map
```

or:

```text
cwa-weather-map
```

---

## 2. CWA Open Data

Required:

- CWA Open Data account
- CWA API authorization key

Need:

```text
CWA_API_KEY
```

Do not send the key through normal documentation or commit it to Git.

---

## 3. Supabase

Required:

- Supabase account
- Supabase project

Need:

```text
Project URL
Project Reference ID
Database connection string
Service role key
```

Also create:

```text
Storage bucket: weather-data
```

The Supabase project region should preferably be geographically close to Taiwan if an appropriate region is available.

---

## 4. Vercel

Required:

- Vercel account
- GitHub connected to Vercel
- Vercel project linked to repository

Need:

```text
Vercel project URL
```

No permanent deployment key is normally required for standard Git integration.

Environment variables need to be configured in Vercel.

---

# 19. Information Needed Before Implementation

Before implementation begins, provide or decide the following.

## Required

### GitHub

```text
GitHub repository URL
```

### CWA

Confirm:

```text
CWA Open Data account created: yes/no
CWA API key obtained: yes/no
```

Do not paste the actual key into Git or this document.

### Supabase

Provide non-secret project information:

```text
Supabase project URL
Supabase project reference ID
Storage bucket name
```

Configure secrets separately:

```text
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
```

### Vercel

Provide:

```text
Vercel project / team name
Production domain if one already exists
```

---

## Helpful But Not Required Immediately

### Custom domain

Example:

```text
weather.example.com
```

Can be added later.

### Branding

Decide:

```text
Application name
Logo
Primary visual style
```

### Map Style

Choose either:

```text
OpenStreetMap-based style
```

or another MapLibre-compatible tile/style provider.

If a commercial tile provider is selected, its API key may also be required.

---

# 20. Secrets Checklist

The following secrets must never be committed to Git:

```text
CWA_API_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
INGESTION_SECRET
```

Potential additional secrets:

```text
MAP_TILE_API_KEY
SENTRY_DSN
```

if those services are introduced later.

---

# 21. Suggested `.env.example`

Commit this file:

```env
# CWA
CWA_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
SUPABASE_STORAGE_BUCKET=weather-data

# Internal jobs
INGESTION_SECRET=

# Optional map provider
MAP_TILE_API_KEY=
```

Do NOT commit `.env.local`.

---

# 22. Initial Setup Order

Recommended setup sequence:

```text
1. Create GitHub repository

2. Create Supabase project

3. Create Supabase Storage bucket
   weather-data

4. Create CWA Open Data account
   obtain CWA API key

5. Connect GitHub repository to Vercel

6. Add Vercel environment variables

7. Configure GitHub Actions secrets

8. Initialize monorepo

9. Initialize Supabase CLI

10. Create initial Drizzle schema

11. Generate first migration

12. Deploy database migration

13. Build first backend health endpoint

14. Deploy to Vercel

15. Verify GitHub push -> automatic deployment

16. Implement first CWA dataset ingestion

17. Begin accumulating historical data
```

---

# 23. First Development Milestones

## Milestone 1 — Foundation

Deliver:

- pnpm monorepo
- React + Vite frontend
- Hono backend
- Supabase connection
- Drizzle migration setup
- Vercel deployment
- GitHub CI
- MapLibre base map
- `/api/health`

---

## Milestone 2 — CWA Data Gateway

Deliver:

- CWA client package
- Station metadata ingestion
- Station observation ingestion
- Normalized internal types
- Database persistence

---

## Milestone 3 — Historical Data

Deliver:

- Historical station queries
- weather_frames table
- Storage integration
- ingestion jobs
- first timeline API

---

## Milestone 4 — Weather Map Layers

Deliver:

- Temperature
- Humidity
- Rainfall
- Weather station markers
- map layer switcher

---

## Milestone 5 — Radar

Deliver:

- Radar ingestion
- Radar Storage persistence
- Radar frame metadata
- timeline playback
- crossfade animation

---

## Milestone 6 — Wind

Deliver:

- WRF / numerical-model source integration
- GRIB2 processing pipeline
- compact wind-field format
- WebGL wind particles
- forecast timeline integration

---

## Milestone 7 — Additional Layers

Deliver:

- Lightning
- Satellite
- Typhoon
- Warnings

---

## Milestone 8 — Polish

Deliver:

- Smooth transitions
- map legends
- responsive UI
- mobile support
- loading / error states
- performance tuning
- project documentation

---

# 24. Open Technical Decisions

These should be resolved during implementation, not necessarily before coding begins.

## Map tile provider

Default recommendation:

```text
MapLibre GL JS + OpenStreetMap-compatible basemap
```

Exact provider can be chosen later.

## PostGIS

Do not enable immediately unless required.

Introduce when implementing:

- viewport spatial search
- warning polygon intersection
- nearest station
- geographic radius queries

## Raw GRIB retention

Options:

```text
A. Keep raw GRIB forever
B. Keep raw GRIB for limited retention
C. Keep only processed wind files
```

Start with a configurable retention strategy.

## Authentication

Not required for MVP.

Supabase Auth can be added later if the product gains:

- accounts
- favorite locations
- personal alerts
- saved map configurations

---

# 25. Design Principles

1. The frontend never needs to know CWA credentials.
2. The frontend does not directly own database logic.
3. All schema changes are version-controlled migrations.
4. Large files belong in object storage, not PostgreSQL.
5. Historical forecasts are versioned, not overwritten.
6. Timeline logic is shared across layers.
7. GRIB processing is separated from request/response API workloads.
8. CWA-specific formats are normalized behind a dedicated client/adapter.
9. Architecture should support adding another weather provider later.
10. GitHub remains the source of truth for code and migrations.

---

# 26. Minimum Information Needed From Project Owner

To start implementation, the project owner only needs to prepare:

```text
1. GitHub repository URL
2. CWA Open Data account
3. CWA API key configured as a secret
4. Supabase project
5. Supabase project URL / ref
6. Supabase Storage bucket
7. Supabase service-role key configured as a secret
8. PostgreSQL DATABASE_URL configured as a secret
9. Vercel project connected to GitHub
10. Optional custom domain
```

Do not send long-lived production secrets in chat if they can instead be configured directly in Vercel, Supabase, or GitHub Secrets.

