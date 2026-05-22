import type { IDatabase } from '../../types/database.types.js';

const hasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  try {
    const result = await db.getMany<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName]
    );
    return result.length > 0;
  } catch {
    return false;
  }
};

export const up = async (db: IDatabase): Promise<void> => {
  if (!(await hasTable(db, 'report_schedules'))) {
    return;
  }

  try {
    const columns = await db.getMany<{ name: string }>('PRAGMA table_info(report_schedules)');
    const hasTenantColumn = columns.some((column) => column.name === 'tenant_id');
    if (!hasTenantColumn) {
      await db.executeQuery('ALTER TABLE report_schedules ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1');
    }
  } catch {
    // PRAGMA not supported (PostgreSQL) - column already exists
  }

  try {
    await db.executeQuery('UPDATE report_schedules SET tenant_id = 1 WHERE tenant_id IS NULL');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_id ON report_schedules(tenant_id)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_report_type ON report_schedules(tenant_id, report_type)');
  } catch {
    // Index may already exist
  }
};
