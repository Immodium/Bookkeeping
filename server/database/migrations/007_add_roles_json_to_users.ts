import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    const tableInfo = await db.getMany('PRAGMA table_info(users)', []);
    const hasRoles = tableInfo.some((col: any) => col.name === 'roles');
    if (!hasRoles) {
      await db.executeQuery("ALTER TABLE users ADD COLUMN roles TEXT");
    }
  } catch {
    // Column may already exist
  }
};
