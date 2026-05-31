// Payment routes for Slimbooks API
// Handles all payment-related endpoints

import { Router } from 'express';
import {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentStats,
  bulkDeletePayments,
  searchPayments
} from '../controllers/index.js';
import {
  requireAuth,
  validateRequest,
  validationSets
} from '../middleware/index.js';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import type { PaymentMethod, PaymentStatus } from '../types/index.js';

const router: Router = Router();

const normalizePaymentMethod = (rawMethod: unknown): PaymentMethod => {
  const method = String(rawMethod || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (['cash', 'check', 'bank_transfer', 'credit_card', 'paypal', 'other'].includes(method)) {
    return method as PaymentMethod;
  }
  if (method.includes('card') || method.includes('credit')) return 'credit_card';
  if (method.includes('bank') || method.includes('transfer')) return 'bank_transfer';
  if (method.includes('paypal')) return 'paypal';
  if (method.includes('check') || method.includes('cheque')) return 'check';
  if (method.includes('cash')) return 'cash';
  return 'other';
};

const normalizePaymentStatus = (rawStatus: unknown): PaymentStatus => {
  const status = String(rawStatus || '').trim().toLowerCase();
  if (['received', 'pending', 'failed', 'refunded'].includes(status)) {
    return status as PaymentStatus;
  }
  if (status.includes('received') || status.includes('paid') || status.includes('complete')) return 'received';
  if (status.includes('pending') || status.includes('processing')) return 'pending';
  if (status.includes('failed') || status.includes('error') || status.includes('declined')) return 'failed';
  if (status.includes('refund')) return 'refunded';
  return 'pending';
};

const normalizePaymentDate = (rawDate: unknown): string => {
  const parsed = new Date(String(rawDate || ''));
  if (Number.isNaN(parsed.getTime())) {
    return String(rawDate || '');
  }
  return parsed.toISOString().split('T')[0] || String(rawDate || '');
};

// All payment routes require authentication
router.use(requireAuth);
router.use(applyTenantSchema);

// GET /api/payments - Get all payments with optional filtering
router.get('/', getAllPayments);

// GET /api/payments/stats - Get payment statistics
router.get('/stats', getPaymentStats);

// GET /api/payments/search - Search payments
router.get('/search', searchPayments);

// POST /api/payments - Create a new payment
router.post('/',
  validationSets.createPayment,
  validateRequest,
  createPayment
);

// POST /api/payments/bulk-delete - Bulk delete payments
router.post('/bulk-delete',
  validationSets.bulkDeletePayments,
  validateRequest,
  bulkDeletePayments
);

// POST /api/payments/bulk-import - Bulk import payments
router.post('/bulk-import',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { payments } = req.body;
      
      if (!payments || !Array.isArray(payments)) {
        return res.status(400).json({
          success: false,
          error: 'Payments array is required'
        });
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Import the payment service
      const { paymentService } = await import('../services/PaymentService.js');

      const tenantId = req.tenantId || req.user?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant context is required'
        });
      }

      for (let i = 0; i < payments.length; i++) {
        const paymentData = payments[i];
        try {
          const parsedAmount = typeof paymentData?.amount === 'number'
            ? paymentData.amount
            : Number.parseFloat(String(paymentData?.amount || '').replace(/[$,]/g, ''));
          const amount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : 0;
          const normalizedPayment = {
            date: normalizePaymentDate(paymentData?.date),
            client_name: String(paymentData?.client_name || '').trim(),
            client_id: typeof paymentData?.client_id === 'number' ? paymentData.client_id : undefined,
            invoice_id: typeof paymentData?.invoice_id === 'number' ? paymentData.invoice_id : undefined,
            amount,
            method: normalizePaymentMethod(paymentData?.method),
            reference: typeof paymentData?.reference === 'string' ? paymentData.reference : undefined,
            description: typeof paymentData?.description === 'string' ? paymentData.description : undefined,
            status: normalizePaymentStatus(paymentData?.status)
          };

          await paymentService.createPayment(normalizedPayment, tenantId);
          successCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = (error as Error).message;
          errors.push(`Payment ${i + 1}: ${errorMessage}`);
        }
      }

      res.json({
        success: true,
        data: {
          imported: successCount,
          failed: errorCount,
          errors
        },
        message: `Import completed: ${successCount} payments imported, ${errorCount} failed`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import payments'
      });
    }
  }
);

// GET /api/payments/:id - Get payment by ID
router.get('/:id', getPaymentById);

// PUT /api/payments/:id - Update payment
router.put('/:id',
  validationSets.updatePayment,
  validateRequest,
  updatePayment
);

// DELETE /api/payments/:id - Delete payment
router.delete('/:id', deletePayment);

export default router;