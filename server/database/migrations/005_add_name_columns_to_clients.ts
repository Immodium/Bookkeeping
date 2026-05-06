import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    const tableInfo = db.getMany('PRAGMA table_info(clients)', []);
    const hasFirstName = tableInfo.some((col: any) => col.name === 'first_name');
    if (!hasFirstName) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN first_name TEXT');
    }
    const hasLastName = tableInfo.some((col: any) => col.name === 'last_name');
    if (!hasLastName) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN last_name TEXT');
    }
  } catch {
    // Columns may already exist
  }
};
