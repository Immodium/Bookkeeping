import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    await db.executeQuery('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column may already exist
  }
};
