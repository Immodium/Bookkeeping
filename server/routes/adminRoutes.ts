// Platform admin dashboard routes
// Requires auth + platform admin (tenant_id === 1)

import { Router, Request, Response } from 'express';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import { requireAuth, requireAdmin, requirePlatformAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { databaseService } from '../core/DatabaseService.js';
import { auditService } from '../services/AuditService.js';
import { serverConfig } from '../config/index.js';
import { usageService } from '../services/UsageService.js';

const router: Router = Router();

router.use(requireAuth);
router.use(applyTenantSchema);
router.use(requireAdmin);
router.use(requirePlatformAdmin);

/**
 * GET /api/admin/stats
 * Platform-level statistics.
 */
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!serverConfig.saasMode) {
      res.status(404).json({ success: false, error: 'Endpoint unavailable when SAAS_MODE is disabled' });
      return;
    }

    // Tenant counts
    const tenantTotals = await databaseService.getOne<{
      total: number;
      active: number;
      suspended: number;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM tenants`
    );

    // Trialing tenants — those whose subscription status is 'trialing'
    const trialingRow = await databaseService.getOne<{ trialing: number }>(
      `SELECT COUNT(*) AS trialing FROM tenant_subscriptions WHERE status = 'trialing'`
    );

    // MRR: sum price_cents for all active subscriptions
    const mrrRow = await databaseService.getOne<{ mrr_cents: number }>(
      `SELECT COALESCE(SUM(sp.price_cents), 0) AS mrr_cents
       FROM tenant_subscriptions ts
       JOIN subscription_plans sp ON sp.id = ts.plan_id
       WHERE ts.status = 'active'`
    );

    // Subscriptions by plan
    const byPlan = await databaseService.getMany<{ plan: string; count: number; price_cents: number }>(
      `SELECT sp.code AS plan, COUNT(*) AS count, sp.price_cents
       FROM tenant_subscriptions ts
       JOIN subscription_plans sp ON sp.id = ts.plan_id
       GROUP BY sp.id, sp.code, sp.price_cents`
    );

    // User totals
    const userTotals = await databaseService.getOne<{ total: number; new_last_30_days: number }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS new_last_30_days
       FROM users`
    );

    // Recent activity — last 10 audit events across all tenants
    const { events: recentActivity } = await auditService.getAuditLog({ limit: 10, offset: 0 });

    res.json({
      success: true,
      data: {
        tenants: {
          total: tenantTotals?.total ?? 0,
          active: tenantTotals?.active ?? 0,
          suspended: tenantTotals?.suspended ?? 0,
          trialing: trialingRow?.trialing ?? 0
        },
        subscriptions: {
          mrr_cents: mrrRow?.mrr_cents ?? 0,
          by_plan: byPlan
        },
        users: {
          total: userTotals?.total ?? 0,
          new_last_30_days: userTotals?.new_last_30_days ?? 0
        },
        recentActivity
      }
    });
  })
);

/**
 * GET /api/admin/usage
 * Top 10 tenants by invoice count for the current month.
 */
router.get(
  '/usage',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // Get current period (YYYY-MM)
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const topTenants = await databaseService.getMany<{ tenant_id: number; value: number }>(
      `SELECT tenant_id, value FROM usage_records
       WHERE metric = 'invoices_created' AND period = ?
       ORDER BY value DESC
       LIMIT 10`,
      [period]
    );

    res.json({ success: true, data: { period, topTenantsByInvoices: topTenants } });
  })
);

export default router;
