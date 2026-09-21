import {
  bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey,
  real, serial, smallint, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => ts('created_at').notNull().defaultNow()

// Every table has RLS enabled with NO policies: Supabase exposes `public` over its REST API to the public
// anon key, and only RLS stops that. The API connects as `postgres`, which bypasses RLS. New tables must do the same.

export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  cwaStationId: text('cwa_station_id').notNull().unique(),
  name: text('name').notNull(),
  county: text('county'),
  town: text('town'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  elevation: real('elevation'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}).enableRLS()

// ponytail: no surrogate id / created_at and 4-byte columns — ~300k rows/day on a 500 MB
// free tier. PK doubles as the (station_id, observed_at) index and the upsert target.
export const stationObservations = pgTable('station_observations', {
  stationId: integer('station_id').notNull().references(() => stations.id),
  observedAt: ts('observed_at').notNull(),
  temperature: real('temperature'),
  humidity: smallint('humidity'),
  pressure: real('pressure'),
  windSpeed: real('wind_speed'),
  windDirection: smallint('wind_direction'),
  gustSpeed: real('gust_speed'),
  rain1h: real('rain_1h'),
  rain24h: real('rain_24h'),
}, (t) => [
  primaryKey({ columns: [t.stationId, t.observedAt] }),
  index('station_observations_observed_at_idx').on(t.observedAt.desc()),
]).enableRLS()

export const forecastRuns = pgTable('forecast_runs', {
  id: serial('id').primaryKey(),
  dataset: text('dataset').notNull(),
  issuedAt: ts('issued_at').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('forecast_runs_dataset_issued_at_idx').on(t.dataset, t.issuedAt)]).enableRLS()

export const forecastValues = pgTable('forecast_values', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: integer('run_id').notNull().references(() => forecastRuns.id, { onDelete: 'cascade' }),
  locationId: text('location_id').notNull(),
  validAt: ts('valid_at').notNull(),
  temperature: real('temperature'),
  humidity: smallint('humidity'),
  windSpeed: real('wind_speed'),
  windDirection: smallint('wind_direction'),
  rainProbability: smallint('rain_probability'),
  weatherCode: text('weather_code'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('forecast_values_run_location_valid_idx').on(t.runId, t.locationId, t.validAt)]).enableRLS()

export const weatherFrames = pgTable('weather_frames', {
  id: serial('id').primaryKey(),
  layerType: text('layer_type').notNull(), // radar | satellite | wind | rain-grid | temperature-grid
  observedAt: ts('observed_at'),
  issuedAt: ts('issued_at'),
  validAt: ts('valid_at').notNull(), // the time this frame sits at on the timeline
  storagePath: text('storage_path').notNull().unique(),
  minLat: doublePrecision('min_lat').notNull(),
  maxLat: doublePrecision('max_lat').notNull(),
  minLon: doublePrecision('min_lon').notNull(),
  maxLon: doublePrecision('max_lon').notNull(),
  metadataJson: jsonb('metadata_json'),
  createdAt: createdAt(),
}, (t) => [index('weather_frames_layer_valid_at_idx').on(t.layerType, t.validAt.desc())]).enableRLS()

export const warnings = pgTable('warnings', {
  id: serial('id').primaryKey(),
  cwaWarningId: text('cwa_warning_id').notNull().unique(),
  warningType: text('warning_type').notNull(),
  issuedAt: ts('issued_at').notNull(),
  expiresAt: ts('expires_at'),
  title: text('title').notNull(),
  description: text('description'),
  geometry: jsonb('geometry'), // GeoJSON; PostGIS deferred per DESIGN §24
  rawJson: jsonb('raw_json'),
  createdAt: createdAt(),
}, (t) => [index('warnings_issued_expires_idx').on(t.issuedAt, t.expiresAt)]).enableRLS()

export const typhoonTracks = pgTable('typhoon_tracks', {
  id: serial('id').primaryKey(),
  typhoonId: text('typhoon_id').notNull(),
  observedAt: ts('observed_at').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  pressure: real('pressure'),
  maxWindSpeed: real('max_wind_speed'),
  movementDirection: text('movement_direction'),
  movementSpeed: real('movement_speed'),
  isForecast: boolean('is_forecast').notNull().default(false),
  forecastLeadHours: smallint('forecast_lead_hours'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('typhoon_tracks_point_idx').on(t.typhoonId, t.observedAt, t.isForecast)]).enableRLS()
