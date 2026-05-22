// GDPR compliance routes — data export and user erasure

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { gdprService } from '../services/GdprService.js';
import { auditService } from '../services/AuditService.js';

const router: Router = Router();

router.use(requireAuth);
router.use(requireAdmin);

/**
 * POST /api/gdpr/export
 * Export all personal data for the current tenant as a JSON attachment.
 */
router.post(
  '/export',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const date = new Date().toISOString().split('T')[0];

    const data = await gdprService.exportTenantData(tenantId);

    // Fire-and-forget audit log
    auditService.log({
      tenantId,
      userId: req.user?.id,
      action: 'gdpr.export',
      ipAddress: req.ip ?? undefined,
      userAgent: req.get('user-agent') ?? undefined
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="data-export-${tenantId}-${date}.json"`);
    res.json(data);
  })
);

/**
 * DELETE /api/gdpr/users/:userId
 * Anonymise a specific user's PII (right to erasure). Tenant-scoped.
 */
router.delete(
  '/users/:userId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    await gdprService.eraseUser(userId, tenantId);

    // Fire-and-forget audit log
    auditService.log({
      tenantId,
      userId: req.user?.id,
      action: 'gdpr.user_erase',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip ?? undefined,
      userAgent: req.get('user-agent') ?? undefined
    });

    res.json({ success: true, message: 'User data erased' });
  })
);

export default router;
