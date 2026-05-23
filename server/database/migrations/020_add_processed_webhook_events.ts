import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      id          SERIAL PRIMARY KEY,
      event_id    TEXT NOT NULL UNIQUE,
      provider    TEXT NOT NULL DEFAULT 'stripe',
      processed_at TEXT NOT NULL DEFAULT (NOW())
    )
  `);

  await db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_event_id
    ON processed_webhook_events (event_id)
  `);
};
