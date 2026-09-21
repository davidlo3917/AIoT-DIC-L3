import { bearerAuth } from 'hono/bearer-auth'
import { createMiddleware } from 'hono/factory'

/** `Authorization: Bearer $INGESTION_SECRET`. Hono's bearerAuth does the timing-safe compare. */
export const ingestAuth = createMiddleware(async (c, next) => {
  const token = process.env.INGESTION_SECRET
  // Fail closed: with no secret configured nobody gets in, rather than everybody.
  if (!token || token.length < 32) return c.json({ error: 'ingestion is not configured' }, 503)
  return bearerAuth({ token })(c, next)
})
