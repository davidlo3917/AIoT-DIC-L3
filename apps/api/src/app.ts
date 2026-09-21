import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { db } from './db/client.js'
import { ingestGrids, pruneFrames } from './ingestion/grids.js'
import { ingestStations } from './ingestion/stations.js'
import { ingestAuth } from './middleware/ingestAuth.js'
import { publicRoutes } from './routes/public.js'

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
  .route('/', publicRoutes)
  .use('/internal/*', ingestAuth)
  .post('/internal/ingest/stations', async (c) => c.json(await ingestStations()))
  .post('/internal/ingest/grids', async (c) => c.json(await ingestGrids()))
  .post('/internal/prune/frames', async (c) => c.json(await pruneFrames()))

// Errors reach logs in full; clients get a generic body (CWA/DB messages can carry internals).
app.onError((e, c) => {
  if (e instanceof HTTPException) return e.getResponse() // deliberate responses, e.g. bearerAuth's 401
  console.error(`${c.req.method} ${c.req.path} failed:`, e)
  return c.json({ error: 'internal error' }, 500)
})

export type AppType = typeof app
export default app
