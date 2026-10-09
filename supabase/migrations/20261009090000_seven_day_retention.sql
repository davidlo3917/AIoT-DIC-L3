-- Hand-written: keep every station observation for 7 days, then delete it (chosen 2026-10-09). The timeline plays
-- back 7 days at the 10-minute cadence, and nothing reads older rows. Measured: ~193k rows/day at ~240 B each, so
-- 7 days is ~325 MB of the 500 MB free tier (60 days of hourly rows would have passed 500 MB in November).
--
-- private.prune keeps its two windows; `fine = hourly` now means "no hourly tier", so the check allows equality.

create or replace function private.prune(fine interval, hourly interval) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  n_expired bigint;
  n_thinned bigint;
  result jsonb;
begin
  if fine <= interval '0' or hourly < fine then
    raise exception 'prune: need 0 < fine <= hourly, got fine=%, hourly=%', fine, hourly;
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

-- Same job name, so this replaces the schedule from 20260921130100_retention_prune.sql. 19:30 UTC = 03:30 in Taiwan.
select cron.schedule('prune', '30 19 * * *', $$select private.prune(interval '7 days', interval '7 days')$$);
