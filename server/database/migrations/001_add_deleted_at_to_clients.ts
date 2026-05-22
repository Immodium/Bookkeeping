import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    const tableInfo = await db.getMany('PRAGMA table_info(clients)', []);
    const hasDeletedAt = tableInfo.some((col: any) => col.name === 'deleted_at');
    if (!hasDeletedAt) {
      await db.executeQuery('ALTER TABLE clients ADD COLUMN deleted_at TEXT');
    }
  } catch {
    // Column may already exist or PRAGMA not supported (PostgreSQL)
  }
};
