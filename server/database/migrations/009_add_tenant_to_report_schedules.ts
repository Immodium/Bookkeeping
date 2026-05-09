import type { IDatabase } from '../../types/database.types.js';

const hasTable = (db: IDatabase, tableName: string): boolean => {
  const result = db.getMany<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return result.length > 0;
};

export const up = (db: IDatabase): void => {
  if (!hasTable(db, 'report_schedules')) {
    return;
  }

  const columns = db.getMany<{ name: string }>('PRAGMA table_info(report_schedules)');
  const hasTenantColumn = columns.some((column) => column.name === 'tenant_id');

  if (!hasTenantColumn) {
    db.executeQuery('ALTER TABLE report_schedules ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1');
  }

  db.executeQuery('UPDATE report_schedules SET tenant_id = 1 WHERE tenant_id IS NULL');
  db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_id ON report_schedules(tenant_id)');
  db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_report_type ON report_schedules(tenant_id, report_type)');
};
