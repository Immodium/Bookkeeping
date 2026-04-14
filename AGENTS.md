# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Slimbooks is a self-hosted FreshBooks-clone invoicing app (React 18 + TypeScript + Vite frontend, Express + SQLite backend). See `README.md` for full feature list.

### Dev Server
- `npm run dev` starts both frontend (http://localhost:8080) and backend (http://localhost:3002) concurrently via `tsx watch` + Vite.
- The backend auto-creates `data/slimbooks.db` on first run, runs migrations, and seeds sample data in development.
- Default admin credentials: `admin@slimbooks.app` / `password`.

### Key Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Lint | `npx eslint .` |
| TypeScript check (server) | `npx tsc --noEmit -p server/tsconfig.json` |
| Tests | `npx vitest run` |
| Build | `npm run build` |

### Non-obvious Caveats
- The `.env` file must exist at the project root (loaded by `server/config/index.ts` via dotenv). JWT_SECRET defaults work in development; see `.env` for all configurable options.
- The `counters` table tracks ID sequences for manual inserts. After seeding data, counters are synced to max IDs. If you reset the database, delete `data/slimbooks.db` and restart the server.
- Frontend proxy: Vite proxies `/api` and `/uploads` to `http://localhost:3002` (configured in `vite.config.ts`).
- Migration files in `server/database/migrations/` are `.ts` files imported with `.js` extensions (standard ESM TypeScript convention with tsx).
- The `@/utils/data` barrel module (`src/utils/data/index.ts`) exports validation, CSV import/export, and date-range filtering utilities used across invoice/client/expense/payment components.
- SMTP, Stripe, and Google OAuth are optional services; the app runs fully without them.
