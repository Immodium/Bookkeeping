import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    const tableInfo = await db.getMany('PRAGMA table_info(settings)', []);
    const hasCategory = tableInfo.some((col: any) => col.name === 'category');
    if (!hasCategory) {
      await db.executeQuery("ALTER TABLE settings ADD COLUMN category TEXT DEFAULT 'general'");
    }
  } catch {
    // Column may already exist
  }
};
