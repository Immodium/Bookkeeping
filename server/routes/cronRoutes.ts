// Cron job routes for Slimbooks API
// Handles scheduled task endpoints

import { Router } from 'express';
import { processRecurringInvoicesCron, cronHealthCheck } from '../controllers/cronController.js';

const router: Router = Router();

// Health check endpoint
router.get('/health', cronHealthCheck);

// Process recurring invoices (for cron jobs)
router.post('/recurring-invoices', processRecurringInvoicesCron);

export default router;