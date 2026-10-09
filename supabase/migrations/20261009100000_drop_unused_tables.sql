DROP TABLE "forecast_runs" CASCADE;--> statement-breakpoint
DROP TABLE "forecast_values" CASCADE;--> statement-breakpoint
DROP TABLE "typhoon_tracks" CASCADE;--> statement-breakpoint
DROP TABLE "warnings" CASCADE;--> statement-breakpoint
ALTER TABLE "weather_frames" DROP COLUMN "observed_at";--> statement-breakpoint
ALTER TABLE "weather_frames" DROP COLUMN "issued_at";