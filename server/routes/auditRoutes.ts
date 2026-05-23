// Audit log query routes
// Requires auth + admin. Platform admin (tenant_id=1) may query any tenant.

import { Router, Request, Response } from 'express';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import { requireAuth, requireAdmin, requirePlatformAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { auditService } from '../services/AuditService.js';

const router: Router = Router();

router.use(requireAuth);
router.use(applyTenantSchema);
router.use(requireAdmin);

/**
 * GET /api/audit
 * Query audit log. Platform admins can query any tenant (or all).
 * Regular admins are scoped to their own tenantId.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const isPlatformAdmin = (req.tenantId ?? 1) === 1;

    let tenantId: number | undefined;

    if (isPlatformAdmin) {
      // Platform admin may omit tenantId to get all, or pass a specific one
      tenantId = req.query.tenantId ? Number(req.query.tenantId) : undefined;
    } else {
      // Regular admin is always scoped to their own tenant
      tenantId = req.tenantId;
    }

    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const action = req.query.action as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const { events, total } = await auditService.getAuditLog({
      tenantId,
      userId,
      action,
      from,
      to,
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        events,
        total,
        limit,
        offset
      }
    });
  })
);

export default router;
