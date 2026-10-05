-- Hand-written (DESIGN §14): a second, radar-only fetch between the grid runs.
-- CWA serves only its newest radar picture, and publishes each one 8–10 min after its frame time (sometimes sooner).
-- The :08 grid job therefore often arrives just before a new picture, and when the following one is early, that
-- picture has already been replaced by the next run: 23 of 143 frames were missed in 24 h (measured 2026-10-05).
-- Minute 3, 13, 23…: 13 min after frame time, mid-way through each picture's turn as the newest.
-- Radar only: a full grid run downloads CWA's 2.6 MB rain file, which must not be doubled.
select cron.schedule('ingest-radar', '3-59/10 * * * *', $$select private.trigger_ingest('/api/internal/ingest/grids?layer=radar')$$);
