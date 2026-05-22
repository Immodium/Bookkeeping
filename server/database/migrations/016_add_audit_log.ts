import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   INTEGER,
      user_id     INTEGER,
      action      TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address  TEXT,
      user_agent  TEXT,
      metadata_json TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE SET NULL
    )
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log (tenant_id)
  `);
};
