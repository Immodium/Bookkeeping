// Cron job routes for Slimbooks API
// Handles scheduled task endpoints

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  processRecurringInvoicesCron,
  processRetainerRemindersCron,
  cronHealthCheck
} from '../controllers/cronController.js';
import { serverConfig } from '../config/index.js';

const router: Router = Router();

const requireCronAccess = (req: Request, res: Response, next: NextFunction): void => {
  const cronSecret = req.get('x-cron-secret');
  const configuredSecret = serverConfig.cronJobSecret;

  if (!serverConfig.saasMode && !serverConfig.isProduction) {
    next();
    return;
  }

  if (!configuredSecret) {
    res.status(503).json({
      success: false,
      error: 'Cron endpoint is not configured'
    });
    return;
  }

  if (cronSecret !== configuredSecret) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized cron request'
    });
    return;
  }

  next();
};

// Health check endpoint
router.get('/health', cronHealthCheck);

// Process recurring invoices (for cron jobs)
router.post('/recurring-invoices', requireCronAccess, processRecurringInvoicesCron);
router.post('/retainer-reminders', requireCronAccess, processRetainerRemindersCron);

export default router;