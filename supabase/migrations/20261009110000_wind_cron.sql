-- Hand-written (DESIGN §14): the 10 m wind forecast from CWA's WRF GRIB2 files (M-A0064), 6-hourly to +84 h.
-- CWA runs the model four times a day and uploads the 15 files over about 1.5 h, starting ~5 h after the run
-- (the 00Z files appeared 04:58–06:20 UTC on 2026-10-09). Every 30 min the API reads each file's header and ingests
-- the ones from a newer run than it holds, within a 40 s budget, so a new run is complete within the hour after its
-- last file. A call with nothing new costs 15 small range reads.
select cron.schedule('ingest-wind', '*/30 * * * *', $$select private.trigger_ingest('/api/internal/ingest/wind')$$);
