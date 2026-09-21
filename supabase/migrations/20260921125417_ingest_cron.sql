-- Hand-written (DESIGN §14): scheduled ingestion via Supabase Cron. Not managed by drizzle-kit.
-- The job POSTs to the API's internal ingest routes. The API base URL and bearer token live in Supabase Vault
-- (set with `task cron:secrets`), so neither appears in git or in cron.job's command text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- `private` is not exposed by Supabase's REST API, so this can't be invoked with the public anon key.
create schema if not exists private;

create or replace function private.trigger_ingest(path text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'api_base_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ingestion_secret';
  if base is null or secret is null then
    raise exception 'vault secrets api_base_url / ingestion_secret are not set - run `task cron:secrets`';
  end if;
  return net.http_post(
    url := base || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function private.trigger_ingest(text) from public;

-- Minute 5, 15, 25…: CWA publishes each 10-minute batch a few minutes late. Idempotent: same name reschedules.
select cron.schedule('ingest-stations', '5-59/10 * * * *', $$select private.trigger_ingest('/api/internal/ingest/stations')$$);
