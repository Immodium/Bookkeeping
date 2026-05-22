// Outbound webhook management routes

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { outboundWebhookService } from '../services/OutboundWebhookService.js';

const router: Router = Router();

router.use(requireAuth);

/**
 * GET /api/webhooks
 * List all webhook endpoints for the tenant (secret hidden).
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const endpoints = await outboundWebhookService.listEndpoints(tenantId);
    res.json({ success: true, data: endpoints });
  })
);

/**
 * POST /api/webhooks
 * Register a new webhook endpoint.
 * Body: { url, events?, description? }
 * Returns record + plainSecret (shown once only).
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const { url, events, description } = req.body || {};

    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'url is required' });
      return;
    }

    const result = await outboundWebhookService.registerEndpoint(
      tenantId,
      url,
      Array.isArray(events) ? events : ['*'],
      description
    );
    res.status(201).json({ success: true, data: result });
  })
);

/**
 * PATCH /api/webhooks/:id
 * Update endpoint url/events/active/description.
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid webhook ID' });
      return;
    }

    const { url, events, is_active, description } = req.body || {};
    const updates: { url?: string; events?: string[]; is_active?: boolean; description?: string } = {};
    if (url !== undefined) updates.url = url;
    if (events !== undefined) updates.events = events;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);
    if (description !== undefined) updates.description = description;

    const updated = await outboundWebhookService.updateEndpoint(id, tenantId, updates);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Webhook endpoint not found' });
      return;
    }
    res.json({ success: true, message: 'Webhook endpoint updated' });
  })
);

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook endpoint.
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid webhook ID' });
      return;
    }

    const deleted = await outboundWebhookService.deleteEndpoint(id, tenantId);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Webhook endpoint not found' });
      return;
    }
    res.json({ success: true, message: 'Webhook endpoint deleted' });
  })
);

/**
 * GET /api/webhooks/:id/deliveries
 * Get delivery log for an endpoint.
 */
router.get(
  '/:id/deliveries',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid webhook ID' });
      return;
    }

    const deliveries = await outboundWebhookService.getDeliveries(id, tenantId);
    res.json({ success: true, data: deliveries });
  })
);

export default router;
