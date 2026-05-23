// Expense routes for Slimbooks API
// Handles all expense-related endpoints

import { Router } from 'express';
import {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  getExpenseCategories,
  getExpensesByDateRange,
  uploadReceiptAndExtractExpenseData,
  uploadReceiptFile
} from '../controllers/index.js';
import {
  requireAuth,
  validateRequest,
  validationSets,
  validateFileUpload
} from '../middleware/index.js';
import { applyTenantSchema } from '../middleware/tenantSchema.js';
import multer from 'multer';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

const router: Router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadsDir = resolve(__dirname, '../../public/uploads/receipts');
mkdirSync(uploadsDir, { recursive: true });
const uploadReceipt = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
      return;
    }

    cb(new Error('Only image or PDF files are allowed for receipt OCR'));
  }
});

// All expense routes require authentication
router.use(requireAuth);
router.use(applyTenantSchema);

// Get all expenses
router.get('/', getAllExpenses);

// Get expense statistics
router.get('/stats', getExpenseStats);

// Get expense categories
router.get('/categories', getExpenseCategories);

// Get expenses by date range
router.get('/date-range', getExpensesByDateRange);

// Upload receipt image and extract expense data via OCR
router.post(
  '/receipt-ocr',
  uploadReceipt.single('receipt'),
  validateFileUpload(10 * 1024 * 1024, ['image/*', 'application/pdf']),
  uploadReceiptAndExtractExpenseData
);

// Upload receipt/document without OCR parsing
router.post(
  '/receipt-upload',
  uploadReceipt.single('receipt'),
  validateFileUpload(10 * 1024 * 1024, ['image/*', 'application/pdf']),
  uploadReceiptFile
);

// Get expense by ID
router.get('/:id', 
  validationSets.updateExpense.slice(0, 1), // Just ID validation
  validateRequest,
  getExpenseById
);

// Create new expense
router.post('/', 
  validationSets.createExpense,
  validateRequest,
  createExpense
);

// Update expense
router.put('/:id', 
  validationSets.updateExpense,
  validateRequest,
  updateExpense
);

// Delete expense
router.delete('/:id', 
  validationSets.updateExpense.slice(0, 1), // Just ID validation
  validateRequest,
  deleteExpense
);

// Bulk import expenses
router.post('/bulk-import',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { expenses } = req.body;
      
      if (!expenses || !Array.isArray(expenses)) {
        return res.status(400).json({
          success: false,
          error: 'Expenses array is required'
        });
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Import the expense service
      const { expenseService } = await import('../services/ExpenseService.js');

      for (let i = 0; i < expenses.length; i++) {
        const expenseData = expenses[i];
        try {
          // Use the expense service directly instead of the controller
          await expenseService.createExpense(expenseData);
          successCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = (error as Error).message;
          errors.push(`Expense ${i + 1}: ${errorMessage}`);
        }
      }

      res.json({
        success: true,
        data: {
          imported: successCount,
          failed: errorCount,
          errors
        },
        message: `Import completed: ${successCount} expenses imported, ${errorCount} failed`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import expenses'
      });
    }
  }
);

export default router;