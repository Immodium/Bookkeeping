// Database Migration System
// Handles running migrations in order and tracking migration state

import type { IDatabase } from '../../types/database.types.js';
import { up as migration001 } from './001_add_deleted_at_to_clients.js';
import { up as migration002 } from './002_add_category_to_settings.js';
import { up as migration003 } from './003_separate_template_tables.js';
import { up as migration004 } from './004_fix_expenses_table_schema.js';
import { up as migration005 } from './005_add_name_columns_to_clients.js';
import { up as migration006 } from './006_add_user_roles.js';
import { up as migration007 } from './007_add_roles_json_to_users.js';
import { up as migration008 } from './008_add_multi_tenant_foundation.js';
import { up as migration009 } from './009_add_tenant_to_report_schedules.js';
import { up as migration010 } from './010_add_tenant_scoped_unique_constraints.js';
import { up as migration011 } from './011_add_subscription_and_entitlement_tables.js';
import { up as migration012 } from './012_repair_invoice_foreign_keys.js';
import { up as migration013 } from './013_add_status_to_expenses.js';
import { up as migration014 } from './014_add_token_version_to_users.js';
import { up as migration015 } from './015_add_dunning_events.js';
import { up as migration016 } from './016_add_audit_log.js';
import { up as migration017 } from './017_add_api_keys.js';
import { up as migration018 } from './018_add_outbound_webhooks.js';
import { up as migration019 } from './019_add_usage_records.js';
import { up as migration020 } from './020_add_processed_webhook_events.js';
import { up as migration021 } from './021_add_fk_indexes.js';
import { up as migration022 } from './022_provision_tenant_schemas.js';
import { up as migration023 } from './023_reset_sequences.js';

/**
 * Whether migrations have completed successfully.
 * Used by the /api/health/ready endpoint as a startup gate.
 */
export let migrationsComplete = false;

interface Migration {
  id: string;
  name: string;
  up: (db: IDatabase) => Promise<void>;
}

/**
 * List of all migrations in order
 */
const migrations: Migration[] = [
  { id: '001', name: 'add_deleted_at_to_clients', up: migration001 },
  { id: '002', name: 'add_category_to_settings', up: migration002 },
  { id: '003', name: 'separate_template_tables', up: migration003 },
  { id: '004', name: 'fix_expenses_table_schema', up: migration004 },
  { id: '005', name: 'add_name_columns_to_clients', up: migration005 },
  { id: '006', name: 'add_user_roles', up: migration006 },
  { id: '007', name: 'add_roles_json_to_users', up: migration007 },
  { id: '008', name: 'add_multi_tenant_foundation', up: migration008 },
  { id: '009', name: 'add_tenant_to_report_schedules', up: migration009 },
  { id: '010', name: 'add_tenant_scoped_unique_constraints', up: migration010 },
  { id: '011', name: 'add_subscription_and_entitlement_tables', up: migration011 },
  { id: '012', name: 'repair_invoice_foreign_keys', up: migration012 },
  { id: '013', name: 'add_status_to_expenses', up: migration013 },
  { id: '014', name: 'add_token_version_to_users', up: migration014 },
  { id: '015', name: 'add_dunning_events', up: migration015 },
  { id: '016', name: 'add_audit_log', up: migration016 },
  { id: '017', name: 'add_api_keys', up: migration017 },
  { id: '018', name: 'add_outbound_webhooks', up: migration018 },
  { id: '019', name: 'add_usage_records', up: migration019 },
  { id: '020', name: 'add_processed_webhook_events', up: migration020 },
  { id: '021', name: 'add_fk_indexes', up: migration021 },
  { id: '022', name: 'provision_tenant_schemas', up: migration022 },
  { id: '023', name: 'reset_sequences', up: migration023 },
];

/**
 * Create migrations tracking table if it doesn't exist
 */
const createMigrationsTable = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (NOW())
    )
  `);
};

/**
 * Check if a migration has been applied
 */
const isMigrationApplied = async (db: IDatabase, migrationId: string): Promise<boolean> => {
  try {
    const result = await db.getMany('SELECT id FROM migrations WHERE id = ?', [migrationId]);
    return result.length > 0;
  } catch {
    return false;
  }
};

/**
 * Mark a migration as applied
 */
const markMigrationApplied = async (db: IDatabase, migration: Migration): Promise<void> => {
  await db.executeQuery(
    'INSERT INTO migrations (id, name) VALUES (?, ?)',
    [migration.id, migration.name]
  );
};

// Stable advisory lock key for migrations
const MIGRATION_LOCK_KEY = 20241201;

/**
 * Detect whether we're connected to PostgreSQL
 */
const isPostgres = async (db: IDatabase): Promise<boolean> => {
  try {
    await db.getOne('SELECT pg_backend_pid()');
    return true;
  } catch {
    return false;
  }
};

/**
 * Try to acquire a PostgreSQL advisory lock.
 * Returns true if acquired, false if not (another instance holds it).
 */
const acquireAdvisoryLock = async (db: IDatabase): Promise<boolean> => {
  const result = await db.getOne<{ pg_try_advisory_lock: boolean }>(
    'SELECT pg_try_advisory_lock(?) as pg_try_advisory_lock',
    [MIGRATION_LOCK_KEY]
  );
  return result?.pg_try_advisory_lock === true;
};

/**
 * Release the PostgreSQL advisory lock
 */
const releaseAdvisoryLock = async (db: IDatabase): Promise<void> => {
  await db.executeQuery('SELECT pg_advisory_unlock(?)', [MIGRATION_LOCK_KEY]);
};

/**
 * Determine whether a migration error is safe to ignore.
 * SQLite-specific PRAGMA calls will fail on PostgreSQL — those are safe to skip.
 */
const isSafeToIgnoreError = (sql: string, errMsg: string): boolean => {
  if (sql.toUpperCase().includes('PRAGMA')) return true;
  if (errMsg.toLowerCase().includes('no such table: pragma')) return true;
  if (errMsg.toLowerCase().includes('pragma')) return true;
  return false;
};

/**
 * Run all pending migrations
 */
export const runMigrations = async (db: IDatabase): Promise<void> => {
  const onPostgres = await isPostgres(db);
  let lockAcquired = false;

  try {
    console.log('Running database migrations...');

    // Acquire advisory lock on PostgreSQL to prevent concurrent migrations
    if (onPostgres) {
      const maxWaitMs = 30000;
      const retryIntervalMs = 2000;
      const start = Date.now();

      while (true) {
        lockAcquired = await acquireAdvisoryLock(db);
        if (lockAcquired) break;

        const elapsed = Date.now() - start;
        if (elapsed >= maxWaitMs) {
          throw new Error('Could not acquire migration lock after 30s — another instance may be running migrations');
        }

        console.log(`Migration lock held by another instance — retrying in ${retryIntervalMs}ms...`);
        await new Promise<void>((resolve) => setTimeout(resolve, retryIntervalMs));
      }

      console.log('Migration advisory lock acquired');
    }

    // Create migrations table if it doesn't exist
    await createMigrationsTable(db);

    let migrationsRun = 0;

    // Run each migration if not already applied
    for (const migration of migrations) {
      if (!(await isMigrationApplied(db, migration.id))) {
        console.log(`Running migration ${migration.id}: ${migration.name}`);
        try {
          await migration.up(db);
          await markMigrationApplied(db, migration);
          migrationsRun++;
        } catch (migrationError) {
          const errMsg = (migrationError as Error).message || '';
          // Only ignore known-safe SQLite-specific errors (e.g. PRAGMA on PostgreSQL)
          if (isSafeToIgnoreError('', errMsg)) {
            console.warn(`Migration ${migration.id} encountered a safe-to-ignore error:`, errMsg);
            try {
              await markMigrationApplied(db, migration);
            } catch {
              // Already marked or other issue
            }
          } else {
            // Fatal: re-throw so startup fails
            throw migrationError;
          }
        }
      }
    }

    if (migrationsRun > 0) {
      console.log(`✓ Applied ${migrationsRun} migration(s)`);
    } else {
      console.log('✓ All migrations up to date');
    }

    // Signal that migrations completed successfully
    migrationsComplete = true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Always release the advisory lock
    if (onPostgres && lockAcquired) {
      try {
        await releaseAdvisoryLock(db);
        console.log('Migration advisory lock released');
      } catch (releaseErr) {
        console.warn('Failed to release migration advisory lock:', (releaseErr as Error).message);
      }
    }
  }
};

/**
 * Get migration status
 */
export const getMigrationStatus = async (db: IDatabase): Promise<Array<{id: string, name: string, applied: boolean}>> => {
  await createMigrationsTable(db);

  const results: Array<{id: string, name: string, applied: boolean}> = [];
  for (const migration of migrations) {
    results.push({
      id: migration.id,
      name: migration.name,
      applied: await isMigrationApplied(db, migration.id)
    });
  }
  return results;
};
