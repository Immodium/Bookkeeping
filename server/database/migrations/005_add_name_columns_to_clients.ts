import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  try {
    const checkColumn = async (columnName: string): Promise<boolean> => {
      const rows = await db.getMany(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name = $1`,
        [columnName]
      );
      return rows.length > 0;
    };

    if (!(await checkColumn('first_name'))) {
      await db.executeQuery('ALTER TABLE clients ADD COLUMN first_name TEXT');
    }

    if (!(await checkColumn('last_name'))) {
      await db.executeQuery('ALTER TABLE clients ADD COLUMN last_name TEXT');
    }

    await db.executeQuery(`
      UPDATE clients
      SET
        first_name = CASE
          WHEN first_name IS NULL OR trim(first_name) = '' THEN
            CASE
              WHEN position(' ' IN trim(name)) > 0 THEN left(trim(name), position(' ' IN trim(name)) - 1)
              ELSE trim(name)
            END
          ELSE first_name
        END,
        last_name = CASE
          WHEN last_name IS NULL OR trim(last_name) = '' THEN
            CASE
              WHEN position(' ' IN trim(name)) > 0 THEN substring(trim(name) FROM position(' ' IN trim(name)) + 1)
              ELSE ''
            END
          ELSE last_name
        END
      WHERE name IS NOT NULL AND trim(name) != ''
    `);
  } catch {
    // Columns may already exist or data may already be migrated.
  }
};
