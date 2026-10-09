import { doublePrecision, index, integer, jsonb, pgTable, primaryKey, real, serial, smallint, text, timestamp } from 'drizzle-orm/pg-core'

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

/** One picture per instant per layer, kept in Storage; this is its index. Encoded grids carry their decoding recipe in `metadata_json`. */
export const weatherFrames = pgTable('weather_frames', {
  id: serial('id').primaryKey(),
  layerType: text('layer_type').notNull(), // radar | satellite | rain-grid | temperature-grid | wind
  validAt: ts('valid_at').notNull(), // the time this frame sits at on the timeline
  storagePath: text('storage_path').notNull().unique(),
  minLat: doublePrecision('min_lat').notNull(),
  maxLat: doublePrecision('max_lat').notNull(),
  minLon: doublePrecision('min_lon').notNull(),
  maxLon: doublePrecision('max_lon').notNull(),
  metadataJson: jsonb('metadata_json'),
  createdAt: createdAt(),
}, (t) => [index('weather_frames_layer_valid_at_idx').on(t.layerType, t.validAt.desc())]).enableRLS()
