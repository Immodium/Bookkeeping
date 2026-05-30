import { v7 as uuidv7 } from 'uuid';
import type { IDatabase } from '../../types/database.types.js';

const DEFAULT_TENANT_PUBLIC_ID = '00000000-0000-7000-8000-000000000001';

const isColumnExistsError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate column');
};

const assignPublicId = async (db: IDatabase, tenantId: number): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = uuidv7();
    try {
      await db.executeQuery(
        `
          UPDATE tenants
          SET public_id = ?, updated_at = NOW()
          WHERE id = ? AND (public_id IS NULL OR public_id = '')
        `,
        [publicId, tenantId]
      );
      return;
    } catch (error) {
      const message = (error as Error).message.toLowerCase();
      if (!message.includes('duplicate key')) {
        throw error;
      }
    }
  }

  throw new Error(`Failed to generate unique public_id for tenant ${tenantId}`);
};

export const up = async (db: IDatabase): Promise<void> => {
  try {
    await db.executeQuery('ALTER TABLE tenants ADD COLUMN public_id TEXT');
  } catch (error) {
    if (!isColumnExistsError((error as Error).message)) {
      throw error;
    }
  }

  await db.executeQuery(
    `
      UPDATE tenants
      SET public_id = ?
      WHERE id = 1 AND (public_id IS NULL OR public_id = '')
    `,
    [DEFAULT_TENANT_PUBLIC_ID]
  );

  const missingPublicIds = await db.getMany<{ id: number }>(
    `
      SELECT id
      FROM tenants
      WHERE public_id IS NULL OR public_id = ''
      ORDER BY id
    `
  );

  for (const tenant of missingPublicIds) {
    await assignPublicId(db, tenant.id);
  }

  await db.executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_public_id ON tenants(public_id)');

  await db.executeQuery('ALTER TABLE tenants ALTER COLUMN public_id SET NOT NULL');
};
