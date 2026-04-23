# PostgreSQL Migration Plan (AWS Readiness)

## Goal
Move Slimbooks from local SQLite to managed PostgreSQL (Amazon RDS/Aurora PostgreSQL) with minimal downtime and no data loss.

## Current State
- Runtime DB engine is SQLite (`better-sqlite3`) with file-based storage.
- Data access flows through `IDatabase` and `DatabaseService`.
- Schema setup and migrations are currently SQLite-first.

## Target State
- Runtime-selectable DB engine:
  - `DB_ENGINE=sqlite` (current/default)
  - `DB_ENGINE=postgres` (target)
- Shared service layer continues to use `IDatabase`.
- Postgres adapter implements the same contract as SQLite adapter.

## Compatibility Decisions
1. **Primary app IDs remain integer IDs** backed by sequence/counter compatibility.
2. **Timestamps** migrate to `timestamptz` in PostgreSQL.
3. **Boolean fields** become native `boolean` in PostgreSQL.
4. **JSON-like columns** (e.g. roles, structured settings) move to `jsonb` where useful.

## Phased Execution

### Phase 1: Adapter Foundation (in progress)
- Add DB engine config (`DB_ENGINE` + PG connection settings).
- Add `PostgresDatabase` scaffold implementing `IDatabase`.
- Add factory to choose engine at runtime.

### Phase 2: Schema Translation
- Convert `server/database/schemas/*` to database-agnostic definitions or dual dialect emitters.
- Add Postgres DDL migration set:
  - `users`, `clients`, `invoices`, `expenses`, `payments`, `settings`, `counters`, etc.
- Replace SQLite pragmas with PG connection/session options.

### Phase 3: Query/SQL Porting
- Replace SQLite-specific SQL patterns:
  - `strftime(...)` -> `date_trunc(...)` / `to_char(...)`
  - `datetime('now')` -> `now()`
  - SQLite upsert syntax variants -> PG `ON CONFLICT`
- Validate report queries and analytics endpoints on PG.

### Phase 4: Data Migration
- Export SQLite tables to neutral format (CSV/JSON).
- Load into PostgreSQL in referential order.
- Reconcile counters/sequences:
  - `setval(sequence, max(id), true)`
- Run integrity checks:
  - row counts per table
  - key aggregates (invoice totals, payment totals, expense totals)

### Phase 5: Cutover
- Freeze writes briefly.
- Final delta copy + verification.
- Switch `DB_ENGINE=postgres` and deploy.
- Keep rollback path to SQLite snapshot.

## Validation Checklist
- Auth/login, client CRUD, invoice lifecycle, expense workflows, payments.
- Report generation accuracy vs baseline.
- Scheduled jobs and background processors.
- Backup/restore process for PostgreSQL.

## Rollback Plan
- Keep pre-cutover SQLite snapshot.
- Revert env vars to `DB_ENGINE=sqlite`.
- Re-deploy previous image if PG cutover fails.

## Required Environment Variables
- `DB_ENGINE=postgres`
- `DATABASE_URL=postgres://...` (preferred)
- or discrete values:
  - `PG_HOST`
  - `PG_PORT`
  - `PG_DATABASE`
  - `PG_USER`
  - `PG_PASSWORD`
  - `PG_SSL`
  - `PG_MAX_CONNECTIONS`
