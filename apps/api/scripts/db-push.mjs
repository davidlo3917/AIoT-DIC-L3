// Applies supabase/migrations with the Supabase CLI. Pass extra flags through, e.g. `pnpm db:push --dry-run`.
import { spawnSync } from 'node:child_process'

// Migrations can't run through the transaction pooler (6543); the session pooler is the same host on 5432.
const url = new URL(process.env.DATABASE_URL)
if (url.port === '6543') url.port = '5432'

// URL re-serialisation percent-encodes the password, which `--db-url` requires.
const r = spawnSync('pnpm', ['exec', 'supabase', 'db', 'push', '--workdir', '../..', '--db-url', url.href, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
