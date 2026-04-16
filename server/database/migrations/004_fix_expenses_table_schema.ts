import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  // Ensure expenses table has all expected columns
  try {
    const tableInfo = db.getMany('PRAGMA table_info(expenses)', []);
    const columns = tableInfo.map((col: any) => col.name);

    if (!columns.includes('project')) {
      db.executeQuery('ALTER TABLE expenses ADD COLUMN project TEXT');
    }
    if (!columns.includes('is_billable')) {
      db.executeQuery('ALTER TABLE expenses ADD COLUMN is_billable INTEGER DEFAULT 0');
    }
    if (!columns.includes('client_id')) {
      db.executeQuery('ALTER TABLE expenses ADD COLUMN client_id INTEGER');
    }
  } catch {
    // Columns may already exist
  }
};
