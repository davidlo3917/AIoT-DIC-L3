-- Hand-written (DESIGN §14): schedule the gridded layers and the image-frame prune.
-- Both go through the API (unlike the row prune) because image files live in Storage, which only the API can reach.

-- Rain grid updates every 10 min, temperature hourly; the endpoint skips frames it already has, so one job serves both.
-- Minute 8, 18, 28…: a few minutes after the station job, so the two never pile onto one cold function start.
select cron.schedule('ingest-grids', '8-59/10 * * * *', $$select private.trigger_ingest('/api/internal/ingest/grids')$$);

-- 19:40 UTC = 03:40 in Taiwan, after the row prune. Frames older than 14 days (FRAME_RETENTION_DAYS in the API).
select cron.schedule('prune-frames', '40 19 * * *', $$select private.trigger_ingest('/api/internal/prune/frames')$$);
