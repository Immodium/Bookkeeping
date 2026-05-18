import type { IDatabase } from '../../types/database.types.js';

const hasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  try {
    const result = await db.getMany<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
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
    const columns = await db.getMany<{ name: string }>(`PRAGMA table_info(${tableName})`, []);
    return columns.some((column) => column.name === columnName);
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
