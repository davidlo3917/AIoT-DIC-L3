// Copies API_BASE_URL and INGESTION_SECRET from .env into Supabase Vault, where the cron job reads them.
// Re-run after rotating the secret or changing the production domain. Prints names only, never values.
import postgres from 'postgres'

const wanted = { api_base_url: process.env.API_BASE_URL?.replace(/\/+$/, ''), ingestion_secret: process.env.INGESTION_SECRET }
for (const [name, value] of Object.entries(wanted)) if (!value) throw new Error(`${name}: missing in .env (${name.toUpperCase()})`)
if (!/^https:\/\//.test(wanted.api_base_url)) throw new Error('API_BASE_URL must be https:// — the bearer token travels in this request')

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })
for (const [name, value] of Object.entries(wanted)) {
  const [existing] = await sql`select id from vault.secrets where name = ${name}`
  if (existing) await sql`select vault.update_secret(${existing.id}::uuid, ${value})`
  else await sql`select vault.create_secret(${value}, ${name})`
  console.log(`${existing ? 'updated' : 'created'} vault secret: ${name}`)
}
await sql.end()
