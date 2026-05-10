import type { IDatabase } from '../../types/database.types.js';

const hasTable = (db: IDatabase, tableName: string): boolean => {
  try {
    const result = db.getMany<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName]
    );
    return result.length > 0;
  } catch {
    return false;
  }
};

const hasColumn = (db: IDatabase, tableName: string, columnName: string): boolean => {
  if (!hasTable(db, tableName)) {
    return false;
  }

  const columns = db.getMany<{ name: string }>(`PRAGMA table_info(${tableName})`, []);
  return columns.some((column) => column.name === columnName);
};

export const up = (db: IDatabase): void => {
  if (!hasTable(db, 'expenses')) {
    return;
  }

  if (!hasColumn(db, 'expenses', 'status')) {
    db.executeQuery("ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }

  db.executeQuery("UPDATE expenses SET status = 'pending' WHERE status IS NULL OR TRIM(status) = ''");
};
