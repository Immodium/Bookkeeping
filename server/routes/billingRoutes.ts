import { Router, Request, Response } from 'express';
import { serverConfig } from '../config/index.js';
import { subscriptionService, BillingWebhookEvent } from '../services/SubscriptionService.js';

const router: Router = Router();

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const configuredSecret = serverConfig.billingWebhookSecret;
  const incomingSecret = req.headers['x-billing-webhook-secret'];
  const normalizedIncoming = Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret;

  if (!configuredSecret) {
    if (serverConfig.saasMode || serverConfig.isProduction) {
      res.status(503).json({
        success: false,
        error: 'Billing webhook secret is not configured'
      });
      return;
    }
  } else if (normalizedIncoming !== configuredSecret) {
    res.status(401).json({
      success: false,
      error: 'Invalid billing webhook secret'
    });
    return;
  }

  const payload = req.body as BillingWebhookEvent;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({
      success: false,
      error: 'Webhook payload is required'
    });
    return;
  }

  try {
    const result = await subscriptionService.syncSubscriptionFromWebhook(payload);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
