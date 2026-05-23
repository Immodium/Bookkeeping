import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS dunning_events (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (NOW()),
      metadata_json TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
    )
  `);
};
