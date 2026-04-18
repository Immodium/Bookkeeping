// Expense routes for Slimbooks API
// Handles all expense-related endpoints
import { Router } from 'express';
import { mkdirSync } from 'fs';
import multer from 'multer';
import { join, resolve } from 'path';
import { getAllExpenses, getExpenseById, createExpense, updateExpense, deleteExpense, getExpenseStats, getExpenseCategories, getExpensesByDateRange, parseExpenseDocumentOcr, createExpenseFromDocument } from '../controllers/index.js';
import { requireAuth, requireRole, validateRequest, validationSets } from '../middleware/index.js';
const router = Router();
const expenseUploadPath = resolve(join(process.cwd(), 'public', 'uploads', 'expenses'));
mkdirSync(expenseUploadPath, { recursive: true });
const upload = multer({
    dest: expenseUploadPath,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = [
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/webp',
            'text/plain'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Unsupported file type'));
    }
});
// All expense routes require authentication
router.use(requireAuth);
router.use(requireRole(['admin', 'project_manager']));
// Get all expenses
router.get('/', getAllExpenses);
// Get expense statistics
router.get('/stats', getExpenseStats);
// Get expense categories
router.get('/categories', getExpenseCategories);
// Get expenses by date range
router.get('/date-range', getExpensesByDateRange);
// Get expense by ID
router.get('/:id', validationSets.updateExpense.slice(0, 1), // Just ID validation
validateRequest, getExpenseById);
// Create new expense
router.post('/', validationSets.createExpense, validateRequest, createExpense);
// Update expense
router.put('/:id', validationSets.updateExpense, validateRequest, updateExpense);
// Delete expense
router.delete('/:id', validationSets.updateExpense.slice(0, 1), // Just ID validation
validateRequest, deleteExpense);
// Parse expense document with OCR
router.post('/document/ocr', upload.single('document'), parseExpenseDocumentOcr);
// Upload expense document and auto-create expense
router.post('/document/create', upload.single('document'), createExpenseFromDocument);
// Bulk import expenses
router.post('/bulk-import', requireAuth, async (req, res) => {
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
        const errors = [];
        // Import the expense service
        const { expenseService } = await import('../services/ExpenseService.js');
        for (let i = 0; i < expenses.length; i++) {
            const expenseData = expenses[i];
            try {
                // Use the expense service directly instead of the controller
                await expenseService.createExpense(expenseData);
                successCount++;
            }
            catch (error) {
                errorCount++;
                const errorMessage = error.message;
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
    }
    catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to import expenses'
        });
    }
});
export default router;
//# sourceMappingURL=expenseRoutes.js.map