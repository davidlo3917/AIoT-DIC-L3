import { defineConfig } from 'drizzle-kit'

// generate-only: migrations are applied with `supabase db push` (DESIGN §14), never drizzle-kit push.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: '../../supabase/migrations',
  migrations: { prefix: 'supabase' },
})
