import { serve } from '@hono/node-server'
import app from './app.js'

// A rejection nobody awaited (a dropped pooler socket, typically) is logged, not fatal: `tsx watch` would otherwise die.
process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e))
serve({ fetch: app.fetch, port: 8787 }, (i) => console.log(`api on http://localhost:${i.port}`))
