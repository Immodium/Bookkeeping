import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    const tableInfo = db.getMany('PRAGMA table_info(users)', []);
    const hasRoles = tableInfo.some((col: any) => col.name === 'roles');
    if (!hasRoles) {
      db.executeQuery("ALTER TABLE users ADD COLUMN roles TEXT");
    }
  } catch {
    // Column may already exist
  }
};
