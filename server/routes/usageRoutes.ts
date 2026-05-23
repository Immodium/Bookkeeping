// Usage metering routes

import { Router, Request, Response } from 'express';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { usageService, UsageMetric } from '../services/UsageService.js';

const router: Router = Router();

router.use(requireAuth);
router.use(applyTenantSchema);

const VALID_METRICS: UsageMetric[] = ['invoices_created', 'clients_created', 'api_calls', 'payments_recorded'];

/**
 * GET /api/usage
 * Returns usage summary for current period + last 3 months history for each metric.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const summary = await usageService.getUsageSummary(tenantId);

    const history: Record<string, Array<{ period: string; value: number }>> = {};
    for (const metric of VALID_METRICS) {
      history[metric] = await usageService.getMetricHistory(tenantId, metric, 3);
    }

    res.json({ success: true, data: { summary, history } });
  })
);

/**
 * GET /api/usage/:metric/history
 * Returns time-series for a specific metric (last 6 months).
 */
router.get(
  '/:metric/history',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const { metric } = req.params;

    if (!VALID_METRICS.includes(metric as UsageMetric)) {
      res.status(400).json({ success: false, error: `Invalid metric. Valid metrics: ${VALID_METRICS.join(', ')}` });
      return;
    }

    const history = await usageService.getMetricHistory(tenantId, metric as UsageMetric, 6);
    res.json({ success: true, data: history });
  })
);

export default router;
