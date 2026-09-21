# Weather Taiwan

Windy-style weather map for Taiwan on CWA Open Data. Design: [DESIGN.md](DESIGN.md).

## Develop

```bash
nvm use            # Node 22
pnpm install
cp .env.example .env   # fill in — see DESIGN.md §17
task dev           # web on :5273, api on :8787 (proxied at /api) — `task` lists all tasks
```

## Database

Schema lives in `apps/api/src/db/schema.ts`. Never edit the production DB by hand.

```bash
pnpm db:generate          # schema → supabase/migrations/*.sql — review, commit
pnpm db:push --dry-run    # what would be applied
pnpm db:push              # apply via Supabase CLI (session pooler, derived from DATABASE_URL)
```

## Deploy

Push to `main` → Vercel. One project, root = repo root: static site from `apps/web/dist`, API from `api/index.ts`.
