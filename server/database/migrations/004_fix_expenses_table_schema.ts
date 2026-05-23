import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  // Ensure expenses table has all expected columns
  try {
    const checkColumn = async (columnName: string): Promise<boolean> => {
      const rows = await db.getMany(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = $1`,
        [columnName]
      );
      return rows.length > 0;
    };

    if (!(await checkColumn('project'))) {
      await db.executeQuery('ALTER TABLE expenses ADD COLUMN project TEXT');
    }
    if (!(await checkColumn('is_billable'))) {
      await db.executeQuery('ALTER TABLE expenses ADD COLUMN is_billable INTEGER DEFAULT 0');
    }
    if (!(await checkColumn('client_id'))) {
      await db.executeQuery('ALTER TABLE expenses ADD COLUMN client_id INTEGER');
    }
  } catch {
    // Columns may already exist
  }
};
