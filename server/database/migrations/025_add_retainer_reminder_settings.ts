import type { IDatabase } from '../../types/database.types.js';

const COLUMN_DEFINITIONS: string[] = [
  'email_schedule_enabled INTEGER NOT NULL DEFAULT 0',
  'reminder_days_before INTEGER NOT NULL DEFAULT 3',
  'auto_overdue_reminders INTEGER NOT NULL DEFAULT 0',
  'overdue_reminder_interval_days INTEGER NOT NULL DEFAULT 7',
  'max_overdue_reminders INTEGER NOT NULL DEFAULT 3',
  'overdue_reminder_count INTEGER NOT NULL DEFAULT 0',
  'last_pre_due_reminder_for_date TEXT',
  'last_overdue_reminder_at TIMESTAMPTZ',
  'last_reminder_sent_at TIMESTAMPTZ',
  'last_reminder_type TEXT'
];

const addColumnsToSchema = async (db: IDatabase, schemaName: string): Promise<void> => {
  for (const definition of COLUMN_DEFINITIONS) {
    const [columnName] = definition.split(' ');
    if (!columnName) {
      continue;
    }
    await db.executeQuery(
      `ALTER TABLE "${schemaName}".retainers ADD COLUMN IF NOT EXISTS ${definition}`
    );
  }
};

export const up = async (db: IDatabase): Promise<void> => {
  // Update public retainers table
  await addColumnsToSchema(db, 'public');

  // Update already-provisioned tenant schemas
  const tenantSchemas = await db.getMany<{ schema_name: string }>(
    `SELECT schema_name
     FROM information_schema.schemata
     WHERE schema_name LIKE 'tenant_%'
     ORDER BY schema_name`
  );

  for (const row of tenantSchemas) {
    if (!row.schema_name) {
      continue;
    }
    await addColumnsToSchema(db, row.schema_name);
  }
};
