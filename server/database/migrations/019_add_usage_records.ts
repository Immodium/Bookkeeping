import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id          SERIAL PRIMARY KEY,
      tenant_id   INTEGER NOT NULL,
      metric      TEXT NOT NULL,
      value       INTEGER NOT NULL DEFAULT 0,
      period      TEXT NOT NULL,
      period_type TEXT NOT NULL DEFAULT 'monthly',
      updated_at  TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      UNIQUE (tenant_id, metric, period)
    )
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_period ON usage_records (tenant_id, period)
  `);
};
