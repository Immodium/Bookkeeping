// Tenant schema middleware
// Sets the PostgreSQL search_path per request so all queries hit the correct tenant schema

import { Request, Response, NextFunction } from 'express';
import { PostgreSQLDatabase } from '../database/PostgreSQLDatabase.js';
import { db } from '../database/index.js';

/**
 * Middleware that runs after requireAuth to set the per-request tenant schema.
 * Acquires a dedicated connection, sets search_path = "tenant_N", public, and
 * stores it in AsyncLocalStorage so all downstream database calls use it.
 * Releases the connection when the response finishes.
 */
export const applyTenantSchema = (req: Request, res: Response, next: NextFunction): void => {
  const tenantId = req.tenantId ?? req.user?.tenant_id;
  if (!tenantId) {
    next();
    return;
  }

  if (!(db instanceof PostgreSQLDatabase)) {
    // Non-PostgreSQL database: no schema switching needed
    next();
    return;
  }

  const pgDb = db as PostgreSQLDatabase;

  pgDb.acquireClientForTenant(tenantId).then(({ client, release }) => {
    let released = false;
    const safeRelease = () => {
      if (!released) {
        released = true;
        release();
      }
    };

    res.on('finish', safeRelease);
    res.on('close', safeRelease);

    pgDb.withTenantClient(tenantId, client, () => {
      next();
    });
  }).catch(next);
};
