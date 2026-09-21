import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

// prepare:false — DATABASE_URL is Supabase's transaction pooler, which can't hold prepared statements.
// max:1 — one connection per serverless instance; the pooler does the pooling.
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 })

export const db = drizzle(sql, { schema })
