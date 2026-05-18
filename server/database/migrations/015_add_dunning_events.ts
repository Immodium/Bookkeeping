import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS dunning_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
    )
  `);
};
