import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    const tableInfo = db.getMany('PRAGMA table_info(clients)', []);
    const columns = tableInfo.map((col: any) => col.name);

    if (!columns.includes('first_name')) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN first_name TEXT');
    }

    if (!columns.includes('last_name')) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN last_name TEXT');
    }
  } catch {
    // Columns may already exist
  }
};
