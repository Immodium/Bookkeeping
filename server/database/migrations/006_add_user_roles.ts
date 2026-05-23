import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        permissions TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (NOW())
      )
    `);
  } catch {
    // Table may already exist
  }
};
