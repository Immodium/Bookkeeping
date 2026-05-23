import type { IDatabase } from '../../types/database.types.js';

const hasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  try {
    const result = await db.getMany<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
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
    const rows = await db.getMany(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'report_schedules' AND column_name = 'tenant_id'`,
      []
    );
    if (rows.length === 0) {
      await db.executeQuery('ALTER TABLE report_schedules ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1');
    }
  } catch {
    // Column may already exist
  }

  try {
    await db.executeQuery('UPDATE report_schedules SET tenant_id = 1 WHERE tenant_id IS NULL');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_id ON report_schedules(tenant_id)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant_report_type ON report_schedules(tenant_id, report_type)');
  } catch {
    // Index may already exist
  }
};
