import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   INTEGER NOT NULL,
      user_id     INTEGER NOT NULL,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL UNIQUE,
      key_prefix  TEXT NOT NULL,
      scopes      TEXT NOT NULL DEFAULT '["read","write"]',
      last_used_at TEXT,
      expires_at  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix)
  `);
};
