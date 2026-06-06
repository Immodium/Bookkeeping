// Database Module - PostgreSQL entry point
import { PostgreSQLDatabase } from './PostgreSQLDatabase.js';
import { createTables } from './schemas/tables.schema.js';
import { provisionTenantSchema } from './schemas/tenantSchema.js';
import { initializeAllSeeds } from './seeds/initial.seed.js';
import { runMigrations } from './migrations/index.js';
import { databaseConfig } from '../config/index.js';
import type { IDatabase } from '../types/database.types.js';

export const db: IDatabase = new PostgreSQLDatabase();

export const initializeDatabase = async (includeSampleData = false): Promise<void> => {
  try {
    if (!db.isConnected()) {
      if (!databaseConfig.databaseUrl) {
        throw new Error('DATABASE_URL is required. Set it in your .env file.');
      }
      await db.connect({ path: databaseConfig.databaseUrl });
    }

    // createTables uses CREATE TABLE IF NOT EXISTS, but PostgreSQL still has a
    // TOCTOU race when two sessions check-then-create the same table at the
    // same time (e.g. two vitest workers starting together). The losing session
    // hits a pg_class / pg_type catalog uniqueness violation; treat that as
    // "another session already created the table", wait briefly, and re-run
    // createTables — by then the winning session has finished and every
    // CREATE TABLE IF NOT EXISTS becomes a no-op.
    const MAX_CREATE_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_CREATE_RETRIES; attempt++) {
      try {
        await createTables(db);
        break;
      } catch (err) {
        const msg = (err as Error).message || '';
        const isConcurrentCreate =
          msg.includes('pg_class_relname_nsp_index') ||
          msg.includes('pg_type_typname_nsp_index') ||
          msg.includes('already exists');
        if (!isConcurrentCreate || attempt === MAX_CREATE_RETRIES) throw err;
        console.warn(`⚠ Concurrent table creation (attempt ${attempt}); retrying in 500ms...`);
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    }
    console.log('✓ Database tables created');

    await runMigrations(db);
    console.log('✓ Database migrations completed');

    // report_schedules table
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS report_schedules (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        report_type TEXT NOT NULL,
        frequency TEXT NOT NULL,
        start_date TEXT NOT NULL,
        time_of_day TEXT NOT NULL DEFAULT '09:00',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        date_range_start TEXT,
        date_range_end TEXT,
        config TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_id ON report_schedules(tenant_id)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_report_type ON report_schedules(report_type)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_is_active ON report_schedules(is_active)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run_at ON report_schedules(next_run_at)');

    // PostgreSQL trigger to auto-update updated_at on report_schedules
    await db.executeQuery(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    await db.executeQuery(`
      DROP TRIGGER IF EXISTS update_report_schedules_updated_at ON report_schedules;
      CREATE TRIGGER update_report_schedules_updated_at
        BEFORE UPDATE ON report_schedules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Provision schemas for all existing tenants (idempotent — uses IF NOT EXISTS)
    try {
      const tenants = await db.getMany<{ id: number }>(
        "SELECT id FROM tenants WHERE status != $1",
        ['deleted']
      );
      for (const tenant of tenants) {
        await provisionTenantSchema(db, tenant.id);
      }
      console.log(`✓ Tenant schemas provisioned (${tenants.length} tenant(s))`);
    } catch (err) {
      // Non-fatal: log and continue so startup isn't blocked if tenants table doesn't exist yet
      console.warn('⚠ Could not provision tenant schemas (may be a fresh install):', (err as Error).message);
    }

    await initializeAllSeeds(db, includeSampleData);
    console.log('✓ Database seed data initialized');
    console.log('✓ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    await db.disconnect();
    console.log('✓ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
    throw error;
  }
};

export const checkDatabaseHealth = () => ({
  isConnected: db.isConnected(),
  uptime: 0,
  totalQueries: 0,
  avgQueryTime: 0,
  diskUsage: 0
});

export const backupDatabase = async (backupPath: string): Promise<void> => {
  // PostgreSQL backup is handled externally (pg_dump). Log a message.
  console.log(`PostgreSQL backup should be done with pg_dump. Backup path hint: ${backupPath}`);
};

export const optimizeDatabase = async (): Promise<void> => {
  try {
    await db.executeQuery('VACUUM ANALYZE');
    console.log('✓ Database optimization complete');
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    throw error;
  }
};

export type { IDatabase } from '../types/database.types.js';
export { createTables } from './schemas/tables.schema.js';
export { initializeAllSeeds } from './seeds/initial.seed.js';
