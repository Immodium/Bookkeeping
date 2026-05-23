import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    const rows = await db.getMany(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'roles'`,
      []
    );
    if (rows.length === 0) {
      await db.executeQuery("ALTER TABLE users ADD COLUMN roles TEXT");
    }
  } catch {
    // Column may already exist
  }
};
