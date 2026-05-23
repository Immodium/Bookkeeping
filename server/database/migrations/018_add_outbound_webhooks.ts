import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER NOT NULL,
      url          TEXT NOT NULL,
      secret       TEXT NOT NULL,
      events       TEXT NOT NULL DEFAULT '["*"]',
      is_active    INTEGER NOT NULL DEFAULT 1,
      description  TEXT,
      last_triggered_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (NOW()),
      updated_at   TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
    )
  `);

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id              SERIAL PRIMARY KEY,
      endpoint_id     INTEGER NOT NULL,
      tenant_id       INTEGER NOT NULL,
      event_type      TEXT NOT NULL,
      payload_json    TEXT NOT NULL,
      response_status INTEGER,
      response_body   TEXT,
      attempt_count   INTEGER NOT NULL DEFAULT 1,
      delivered_at    TEXT,
      failed_at       TEXT,
      created_at      TEXT NOT NULL DEFAULT (NOW()),
      FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints (id) ON DELETE CASCADE
    )
  `);
};
