import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    const tableInfo = db.getMany('PRAGMA table_info(settings)', []);
    const hasCategory = tableInfo.some((col: any) => col.name === 'category');
    if (!hasCategory) {
      db.executeQuery("ALTER TABLE settings ADD COLUMN category TEXT DEFAULT 'general'");
    }
  } catch {
    // Column may already exist
  }
};
