import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from './db/client.js'

const app = new Hono().basePath('/api')
  .get('/health', async (c) => {
    // Names a missing variable (never its value) so a misconfigured deploy is diagnosable from the outside.
    if (!process.env.DATABASE_URL) return c.json({ ok: false, db: false, reason: 'DATABASE_URL is not set' }, 503)
    const dbOk = await db.execute(sql`select 1`).then(() => true, (e) => {
      console.error('health: db check failed:', e.code, e.message)
      return false
    })
    return c.json({ ok: dbOk, db: dbOk }, dbOk ? 200 : 503)
  })

export type AppType = typeof app
export default app
