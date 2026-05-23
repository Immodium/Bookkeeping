import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    const rows = await db.getMany(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'deleted_at'`,
      []
    );
    if (rows.length === 0) {
      await db.executeQuery('ALTER TABLE clients ADD COLUMN deleted_at TEXT');
    }
  } catch {
    // Column may already exist
  }
};
