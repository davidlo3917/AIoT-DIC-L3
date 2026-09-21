// Vercel function entry. vercel.json rewrites /api/* here; Hono routes on the original path.
// Re-export only: this file sits outside apps/api, so it can't resolve apps/api's dependencies itself.
export { GET, POST } from '../apps/api/src/vercel.js'
