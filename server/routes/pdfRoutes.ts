// PDF routes for generating PDFs from invoices and reports
// Handles PDF generation endpoints

import { Router } from 'express';
import { param, body, query } from 'express-validator';
import {
  downloadInvoicePDF,
  downloadPublicInvoicePDF,
  generatePagePDF,
  getPDFServiceStatus,
  initializePDFService,
  updatePDFFormat,
  getPDFFormat
} from '../controllers/pdfController.js';
import { requireAuth, validateRequest } from '../middleware/index.js';

const router: Router = Router();

// Invoice PDF download routes
router.get('/invoice/:id/download',
  requireAuth,
  [
    param('id').isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer')
  ],
  validateRequest,
  downloadInvoicePDF
);

// Public invoice PDF access (with token)
router.get('/invoice/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer'),
    query('token').notEmpty().withMessage('Access token is required')
  ],
  validateRequest,
  downloadPublicInvoicePDF
);

// Custom page/report PDF generation
router.post('/page',
  requireAuth,
  [
    body('url').isURL().withMessage('Valid URL is required'),
    body('filename').optional().isString().withMessage('Filename must be a string'),
    body('options').optional().isObject().withMessage('Options must be an object')
  ],
  validateRequest,
  generatePagePDF
);

// PDF service management routes
router.get('/status',
  requireAuth,
  getPDFServiceStatus
);

router.post('/initialize',
  requireAuth,
  initializePDFService
);

// PDF format settings routes
router.get('/format',
  requireAuth,
  getPDFFormat
);

router.put('/format',
  requireAuth,
  [
    body('format').isIn(['A4', 'Letter', 'Legal', 'A3', 'A5']).withMessage('Invalid PDF format')
  ],
  validateRequest,
  updatePDFFormat
);

export default router;