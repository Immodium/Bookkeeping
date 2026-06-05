# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Slimbooks is a self-hosted FreshBooks-clone invoicing app (React 18 + TypeScript + Vite frontend, Express + PostgreSQL backend). See `README.md` for full feature list.

### Dev Server
- `npm run dev` starts both frontend (http://localhost:8080) and backend (http://localhost:3002) concurrently via `tsx watch` + Vite.
- Default admin credentials: `admin@slimbooks.app` / `password`.

### PostgreSQL Requirement
- PostgreSQL 16 is required. Ensure the cluster is online (`sudo pg_ctlcluster 16 main start`).
- Dev credentials: role `slimbooks` with password `slimbooks`, database `slimbooks`.
- Always export `DATABASE_URL=postgresql://slimbooks:slimbooks@localhost:5432/slimbooks?sslmode=disable` before running the dev server.
- Confirm startup with both endpoints: frontend `http://localhost:8080` and backend health `http://localhost:3002/api/health`.

### Key Commands
| Task | Command |
|------|---------|
| Dev server | `DATABASE_URL=postgresql://slimbooks:slimbooks@localhost:5432/slimbooks?sslmode=disable npm run dev` |
| Lint | `npx eslint .` |
| TypeScript check (server) | `npx tsc --noEmit -p server/tsconfig.json` |
| Tests | `npx vitest run` |
| Build | `npm run build` |

### Non-obvious Caveats
- The `.env` file must exist at the project root (loaded by `server/config/index.ts` via dotenv). See `.env.example` for all configurable options.
- **Seed bug (PostgreSQL bigint):** The `initializeAdminUser` and other seed functions in `server/database/seeds/initial.seed.ts` use strict equality (`=== 0`) to compare `COUNT(*)` results. PostgreSQL's `pg` driver returns `COUNT(*)` as a string (bigint), so the condition never triggers. After a fresh database reset, you must manually seed the admin user into BOTH `public.users` and `tenant_1.users` (see the seed script below or use `node scripts/seed-admin.js` if available).
- **Pool search_path leakage:** The `applyTenantSchema` middleware sets `search_path = "tenant_N", public` on connections returned to the pool. Subsequent auth middleware queries (`SELECT ... FROM users`) may hit `tenant_1.users` instead of `public.users`. Ensure the admin user exists in both schemas.
- **Login rate limiting:** Default `LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5` per 15 minutes is very tight during development/testing. Set to 100 in `.env` for dev sessions.
- Frontend proxy: Vite proxies `/api` and `/uploads` to `http://localhost:3002` (configured in `vite.config.ts`).
- Migration files in `server/database/migrations/` are `.ts` files imported with `.js` extensions (standard ESM TypeScript convention with tsx).
- The `@/utils/data` barrel module (`src/utils/data/index.ts`) exports validation, CSV import/export, and date-range filtering utilities used across invoice/client/expense/payment components.
- SMTP and Resend are optional services; the app runs fully without them.
