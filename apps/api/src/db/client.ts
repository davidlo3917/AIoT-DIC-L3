import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// prepare:false — DATABASE_URL is Supabase's transaction pooler, which can't hold prepared statements.
// max:1 — one connection per serverless instance; the pooler does the pooling.
// ssl:'require' — postgres.js connects in plaintext unless told otherwise.
// ponytail: encrypts without checking the certificate; pass Supabase's CA (`ssl: { ca }`) if an active man-in-the-middle ever matters.
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, ssl: 'require' })

export const db = drizzle(sql)
