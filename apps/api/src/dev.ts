import { serve } from '@hono/node-server'
import app from './app.js'

serve({ fetch: app.fetch, port: 8787 }, (i) => console.log(`api on http://localhost:${i.port}`))
