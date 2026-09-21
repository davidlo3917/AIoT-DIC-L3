CREATE TABLE "forecast_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"location_id" text NOT NULL,
	"valid_at" timestamp with time zone NOT NULL,
	"temperature" real,
	"humidity" smallint,
	"wind_speed" real,
	"wind_direction" smallint,
	"rain_probability" smallint,
	"weather_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_observations" (
	"station_id" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"temperature" real,
	"humidity" smallint,
	"pressure" real,
	"wind_speed" real,
	"wind_direction" smallint,
	"gust_speed" real,
	"rain_1h" real,
	"rain_24h" real,
	CONSTRAINT "station_observations_station_id_observed_at_pk" PRIMARY KEY("station_id","observed_at")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"cwa_station_id" text NOT NULL,
	"name" text NOT NULL,
	"county" text,
	"town" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"elevation" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stations_cwa_station_id_unique" UNIQUE("cwa_station_id")
);
--> statement-breakpoint
CREATE TABLE "typhoon_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"typhoon_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"pressure" real,
	"max_wind_speed" real,
	"movement_direction" text,
	"movement_speed" real,
	"is_forecast" boolean DEFAULT false NOT NULL,
	"forecast_lead_hours" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"cwa_warning_id" text NOT NULL,
	"warning_type" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"title" text NOT NULL,
	"description" text,
	"geometry" jsonb,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warnings_cwa_warning_id_unique" UNIQUE("cwa_warning_id")
);
--> statement-breakpoint
CREATE TABLE "weather_frames" (
	"id" serial PRIMARY KEY NOT NULL,
	"layer_type" text NOT NULL,
	"observed_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"valid_at" timestamp with time zone NOT NULL,
	"storage_path" text NOT NULL,
	"min_lat" double precision NOT NULL,
	"max_lat" double precision NOT NULL,
	"min_lon" double precision NOT NULL,
	"max_lon" double precision NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_frames_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "forecast_values" ADD CONSTRAINT "forecast_values_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_observations" ADD CONSTRAINT "station_observations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_runs_dataset_issued_at_idx" ON "forecast_runs" USING btree ("dataset","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_values_run_location_valid_idx" ON "forecast_values" USING btree ("run_id","location_id","valid_at");--> statement-breakpoint
CREATE INDEX "station_observations_observed_at_idx" ON "station_observations" USING btree ("observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "typhoon_tracks_point_idx" ON "typhoon_tracks" USING btree ("typhoon_id","observed_at","is_forecast");--> statement-breakpoint
CREATE INDEX "warnings_issued_expires_idx" ON "warnings" USING btree ("issued_at","expires_at");--> statement-breakpoint
CREATE INDEX "weather_frames_layer_valid_at_idx" ON "weather_frames" USING btree ("layer_type","valid_at" DESC NULLS LAST);