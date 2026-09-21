// What is scheduled, did it run, and what did the API answer? (pg_net keeps responses for ~6 hours.)
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })
console.log('jobs')
console.table(await sql`select jobname, schedule, active from cron.job order by 1`)
console.log('last runs')
console.table(await sql`select j.jobname, r.status, r.start_time, left(r.return_message, 60) as message
  from cron.job_run_details r join cron.job j using (jobid) order by r.start_time desc limit 8`)
console.log('last HTTP responses')
console.table(await sql`select id, status_code, timed_out, left(coalesce(error_msg, content), 110) as body, created
  from net._http_response order by created desc limit 8`)
console.log('data')
console.table(await sql`select count(*)::int as observations, count(distinct observed_at)::int as timestamps,
  max(observed_at) as newest, pg_size_pretty(pg_database_size(current_database())) as db_size from station_observations`)
await sql.end()
