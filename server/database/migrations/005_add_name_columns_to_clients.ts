import type { IDatabase } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    const tableInfo = db.getMany('PRAGMA table_info(clients)', []);
    const columns = tableInfo.map((col: any) => col.name);

    if (!columns.includes('first_name')) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN first_name TEXT');
    }

    if (!columns.includes('last_name')) {
      db.executeQuery('ALTER TABLE clients ADD COLUMN last_name TEXT');
    }

    db.executeQuery(`
      UPDATE clients
      SET
        first_name = CASE
          WHEN first_name IS NULL OR trim(first_name) = '' THEN
            CASE
              WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), 1, instr(trim(name), ' ') - 1)
              ELSE trim(name)
            END
          ELSE first_name
        END,
        last_name = CASE
          WHEN last_name IS NULL OR trim(last_name) = '' THEN
            CASE
              WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), instr(trim(name), ' ') + 1)
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
