-- Hand-written (DESIGN §14): rolling retention for the Supabase Free tier (500 MB), chosen 2026-09-21.
-- Runs inside the database, so it keeps working even if the API or Vercel is down.
--
--   newer than `fine`            every observation (10-minute cadence) — smooth timeline playback
--   `fine` .. `hourly`           only on-the-hour observations
--   older than `hourly`          deleted
--
-- To change the windows: add a migration that re-runs the cron.schedule() line at the bottom with new intervals.
-- ponytail: image frames (weather_frames + Storage objects) are pruned by the API once Storage exists (M5).

create table if not exists private.db_size_log (
  day date primary key,
  db_bytes bigint not null,
  observations bigint not null,
  thinned bigint not null,
  expired bigint not null
);

create or replace function private.prune(fine interval, hourly interval) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  n_expired bigint;
  n_thinned bigint;
  result jsonb;
begin
  if fine <= interval '0' or hourly <= fine then
    raise exception 'prune: need 0 < fine < hourly, got fine=%, hourly=%', fine, hourly;
  end if;

  delete from public.station_observations where observed_at < now() - hourly;
  get diagnostics n_expired = row_count;

  delete from public.station_observations
   where observed_at < now() - fine and extract(minute from observed_at) <> 0;
  get diagnostics n_thinned = row_count;

  -- pg_cron never trims its own history.
  delete from cron.job_run_details where end_time < now() - interval '7 days';

  -- One row per day: the evidence for whether the windows above actually fit in 500 MB.
  insert into private.db_size_log (day, db_bytes, observations, thinned, expired)
  values (current_date, pg_database_size(current_database()), (select count(*) from public.station_observations), n_thinned, n_expired)
  on conflict (day) do update set db_bytes = excluded.db_bytes, observations = excluded.observations,
    thinned = private.db_size_log.thinned + excluded.thinned, expired = private.db_size_log.expired + excluded.expired
  returning to_jsonb(private.db_size_log.*) into result;
  return result;
end $$;

revoke all on function private.prune(interval, interval) from public;

-- 19:30 UTC = 03:30 in Taiwan.
select cron.schedule('prune', '30 19 * * *', $$select private.prune(interval '3 days', interval '60 days')$$);
