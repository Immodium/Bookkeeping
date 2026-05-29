// Migration 023: Reset all public-schema sequences to max(id) + 1
//
// Migrations 008, 010, 012 etc. insert rows with explicit IDs using
// OVERRIDING SYSTEM VALUE (required for GENERATED ALWAYS AS IDENTITY columns).
// PostgreSQL sequences are NOT automatically advanced by such inserts, so the
// next auto-generated ID can conflict with an existing row.
//
// This migration resets every SERIAL/IDENTITY-backed sequence in the public
// schema so that auto-inserts start above the current max row ID.
// It is fully idempotent and safe to re-run.

import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  const sequences = await db.getMany<{ table_name: string; column_name: string }>(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.key_column_usage kcu
     JOIN information_schema.table_constraints tc
       ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema    = tc.table_schema
     JOIN information_schema.columns c
       ON c.table_name   = kcu.table_name
      AND c.column_name  = kcu.column_name
      AND c.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND kcu.table_schema   = 'public'
       AND (c.column_default LIKE 'nextval%' OR c.identity_generation IS NOT NULL)`,
    []
  );

  for (const { table_name, column_name } of sequences) {
    try {
      // pg_get_serial_sequence works for both SERIAL and GENERATED AS IDENTITY
      await db.executeQuery(
        `SELECT setval(
           pg_get_serial_sequence($1, $2),
           COALESCE((SELECT MAX(${column_name}) FROM "${table_name}"), 0) + 1,
           false
         )`,
        [table_name, column_name]
      );
    } catch {
      // Table may not exist on all deployments — skip silently
    }
  }
};
