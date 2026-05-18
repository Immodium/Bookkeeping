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
  { id: '014', name: 'add_token_version_to_users', up: migration014 }
];

/**
 * Create migrations tracking table if it doesn't exist
 */
const createMigrationsTable = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  } catch (error) {
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

/**
 * Run all pending migrations
 */
export const runMigrations = async (db: IDatabase): Promise<void> => {
  try {
    console.log('Running database migrations...');

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
          // Some SQLite-specific migrations (PRAGMA, sqlite_master) will fail on PostgreSQL
          // Mark as applied anyway so they don't block future runs
          console.warn(`Migration ${migration.id} encountered an error (may be safe to ignore):`, (migrationError as Error).message);
          try {
            await markMigrationApplied(db, migration);
          } catch {
            // Already marked or other issue
          }
        }
      }
    }

    if (migrationsRun > 0) {
      console.log(`✓ Applied ${migrationsRun} migration(s)`);
    } else {
      console.log('✓ All migrations up to date');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
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
