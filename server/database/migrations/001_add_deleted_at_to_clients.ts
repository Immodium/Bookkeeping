import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    const tableInfo = db.getMany('PRAGMA table_info(clients)', []);
    const hasDeletedAt = tableInfo.some((col: any) => col.name === 'deleted_at');
    if (!hasDeletedAt) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN deleted_at TEXT');
    }
  } catch {
    // Column may already exist
  }
};
