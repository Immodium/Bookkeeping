import type { IDatabase } from '../../types/database.types.js';

const hasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  try {
    const result = await db.getMany<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
      [tableName]
    );
    return result.length > 0;
  } catch {
    return false;
  }
};

const hasColumn = async (db: IDatabase, tableName: string, columnName: string): Promise<boolean> => {
  if (!(await hasTable(db, tableName))) return false;
  try {
    const rows = await db.getMany<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
      [tableName, columnName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

export const up = async (db: IDatabase): Promise<void> => {
  if (!(await hasTable(db, 'expenses'))) return;

  if (!(await hasColumn(db, 'expenses', 'status'))) {
    await db.executeQuery("ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }

  await db.executeQuery("UPDATE expenses SET status = 'pending' WHERE status IS NULL OR TRIM(status) = ''");
};
