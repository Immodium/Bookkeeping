// Expense controller for Slimbooks
// Handles all expense-related business logic
import { expenseService } from '../services/ExpenseService.js';
import { expenseOcrService } from '../services/ExpenseOcrService.js';
import { AppError, NotFoundError, ValidationError, asyncHandler } from '../middleware/index.js';
/**
 * Get all expenses
 */
export const getAllExpenses = asyncHandler(async (req, res) => {
    const { category, date_from, date_to, is_billable, client_id, limit = '50', offset = '0' } = req.query;
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
        throw new ValidationError('Invalid limit or offset');
    }
    const filters = {};
    if (category)
        filters.category = category;
    if (date_from)
        filters.date_from = date_from;
    if (date_to)
        filters.date_to = date_to;
    if (is_billable === 'true')
        filters.is_billable = true;
    else if (is_billable === 'false')
        filters.is_billable = false;
    if (client_id)
        filters.client_id = parseInt(client_id, 10);
    const results = await expenseService.getAllExpenses(filters, {
        limit: parsedLimit,
        offset: parsedOffset
    });
    res.json({
        success: true,
        data: results
    });
});
/**
 * Get expense by ID
 */
export const getExpenseById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (typeof id !== 'string') {
        throw new ValidationError('Invalid expense ID');
    }
    const expenseId = parseInt(id, 10);
    if (isNaN(expenseId)) {
        throw new ValidationError('Invalid expense ID');
    }
    const expense = await expenseService.getExpenseById(expenseId);
    if (!expense) {
        throw new NotFoundError('Expense');
    }
    res.json({ success: true, data: expense });
});
/**
 * Create new expense
 */
export const createExpense = asyncHandler(async (req, res) => {
    const { expenseData } = req.body;
    if (!expenseData) {
        throw new ValidationError('Expense data is required');
    }
    try {
        const normalizedExpenseData = {
            ...expenseData,
            vendor: expenseData.vendor || expenseData.merchant || null
        };
        delete normalizedExpenseData.merchant;
        const expenseId = await expenseService.createExpense(normalizedExpenseData);
        res.status(201).json({
            success: true,
            data: { id: expenseId },
            message: 'Expense created successfully'
        });
    }
    catch (error) {
        const errorMessage = error.message;
        if (errorMessage.includes('amount') && errorMessage.includes('required')) {
            throw new ValidationError('Valid expense amount is required');
        }
        else if (errorMessage.includes('description') && errorMessage.includes('required')) {
            throw new ValidationError('Expense description is required');
        }
        else if (errorMessage.includes('date') && errorMessage.includes('required')) {
            throw new ValidationError('Expense date is required');
        }
        else if (errorMessage.includes('Invalid date format')) {
            throw new ValidationError('Invalid date format');
        }
        else if (errorMessage.includes('client does not exist')) {
            throw new ValidationError('Specified client does not exist');
        }
        throw new ValidationError(errorMessage);
    }
});
/**
 * Update expense
 */
export const updateExpense = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { expenseData } = req.body;
    const expenseId = parseInt(id, 10);
    if (isNaN(expenseId)) {
        throw new ValidationError('Invalid expense ID');
    }
    if (!expenseData) {
        throw new ValidationError('Expense data is required');
    }
    try {
        // Convert and validate expense data for service layer
        const dbExpenseData = {};
        // Copy all defined properties except is_billable
        Object.keys(expenseData).forEach(key => {
            if (key !== 'is_billable' && expenseData[key] !== undefined) {
                dbExpenseData[key] = expenseData[key];
            }
        });
        if (dbExpenseData.merchant !== undefined && dbExpenseData.vendor === undefined) {
            dbExpenseData.vendor = dbExpenseData.merchant;
        }
        delete dbExpenseData.merchant;
        // Handle is_billable conversion separately
        if (expenseData.is_billable !== undefined) {
            dbExpenseData.is_billable = !!expenseData.is_billable;
        }
        const changes = await expenseService.updateExpense(expenseId, dbExpenseData);
        res.json({
            success: true,
            data: { changes },
            message: 'Expense updated successfully'
        });
    }
    catch (error) {
        const errorMessage = error.message;
        if (errorMessage === 'Expense not found') {
            throw new NotFoundError('Expense');
        }
        else if (errorMessage === 'No valid fields to update') {
            throw new ValidationError('No valid fields to update');
        }
        else if (errorMessage.includes('Valid expense amount')) {
            throw new ValidationError('Valid expense amount is required');
        }
        else if (errorMessage.includes('Invalid date format')) {
            throw new ValidationError('Invalid date format');
        }
        else if (errorMessage.includes('client does not exist')) {
            throw new ValidationError('Specified client does not exist');
        }
        throw new ValidationError(errorMessage);
    }
});
/**
 * Delete expense
 */
export const deleteExpense = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (typeof id !== 'string') {
        throw new ValidationError('Invalid expense ID');
    }
    const expenseId = parseInt(id, 10);
    if (isNaN(expenseId)) {
        throw new ValidationError('Invalid expense ID');
    }
    try {
        const changes = await expenseService.deleteExpense(expenseId);
        res.json({
            success: true,
            data: { changes },
            message: 'Expense deleted successfully'
        });
    }
    catch (error) {
        const errorMessage = error.message;
        if (errorMessage === 'Expense not found') {
            throw new NotFoundError('Expense');
        }
        throw new AppError(errorMessage, 500);
    }
});
/**
 * Get expense statistics
 */
export const getExpenseStats = asyncHandler(async (req, res) => {
    const { date_from, date_to } = req.query;
    const filters = {
        date_from: date_from,
        date_to: date_to
    };
    const stats = await expenseService.getExpenseStats(filters);
    res.json({
        success: true,
        data: stats
    });
});
/**
 * Get expense categories
 */
export const getExpenseCategories = asyncHandler(async (req, res) => {
    const categories = await expenseService.getExpenseCategories();
    res.json({ success: true, data: categories });
});
/**
 * Get expenses by category
 */
export const getExpensesByCategory = asyncHandler(async (req, res) => {
    const { category } = req.params;
    const { limit = '100', offset = '0' } = req.query;
    if (!category) {
        throw new ValidationError('Category parameter is required');
    }
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
        throw new ValidationError('Invalid limit or offset');
    }
    try {
        const expenses = await expenseService.getExpensesByCategory(category, {
            limit: parsedLimit,
            offset: parsedOffset
        });
        res.json({ success: true, data: expenses });
    }
    catch (error) {
        throw new ValidationError(error.message);
    }
});
/**
 * Get billable expenses
 */
export const getBillableExpenses = asyncHandler(async (req, res) => {
    const { client_id, limit = '100', offset = '0' } = req.query;
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
        throw new ValidationError('Invalid limit or offset');
    }
    const clientId = client_id ? parseInt(client_id, 10) : undefined;
    if (client_id && isNaN(clientId)) {
        throw new ValidationError('Invalid client ID');
    }
    const expenses = await expenseService.getBillableExpenses(clientId, {
        limit: parsedLimit,
        offset: parsedOffset
    });
    res.json({ success: true, data: expenses });
});
/**
 * Get expenses by date range
 */
export const getExpensesByDateRange = asyncHandler(async (req, res) => {
    const { start_date, end_date, limit = '100', offset = '0' } = req.query;
    if (!start_date || !end_date) {
        throw new ValidationError('start_date and end_date are required');
    }
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
        throw new ValidationError('Invalid limit or offset');
    }
    try {
        const expenses = await expenseService.getExpensesByDateRange(start_date, end_date, { limit: parsedLimit, offset: parsedOffset });
        res.json({
            success: true,
            data: expenses
        });
    }
    catch (error) {
        throw new ValidationError(error.message);
    }
});
/**
 * Search expenses
 */
export const searchExpenses = asyncHandler(async (req, res) => {
    const { q, limit = '50', offset = '0' } = req.query;
    if (!q || typeof q !== 'string') {
        throw new ValidationError('Search query is required');
    }
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
        throw new ValidationError('Invalid limit or offset');
    }
    const expenses = await expenseService.searchExpenses(q, {
        limit: parsedLimit,
        offset: parsedOffset
    });
    res.json({ success: true, data: expenses });
});
/**
 * OCR parse uploaded expense document
 */
export const parseExpenseDocumentOcr = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ValidationError('Expense document file is required');
    }
    const { extractedExpense: parsedData, metadata } = await expenseOcrService.extractExpenseFromDocument(req.file);
    res.json({
        success: true,
        data: {
            parsedData,
            metadata,
            file: {
                name: req.file.originalname,
                path: `/uploads/expenses/${req.file.filename}`
            }
        }
    });
});
/**
 * Upload expense document, OCR it, and create expense
 */
export const createExpenseFromDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ValidationError('Expense document file is required');
    }
    let parsedData;
    try {
        const extraction = await expenseOcrService.extractExpenseFromDocument(req.file);
        parsedData = extraction.extractedExpense;
        const expenseData = {
            ...parsedData,
            receipt_url: `/uploads/expenses/${req.file.filename}`,
            notes: `Auto-generated from upload: ${req.file.originalname}`
        };
        const expenseId = await expenseService.createExpense(expenseData);
        const createdExpense = await expenseService.getExpenseById(expenseId);
        res.status(201).json({
            success: true,
            data: {
                expense: createdExpense,
                parsedData,
                metadata: extraction.metadata
            },
            message: 'Expense created from document upload'
        });
    }
    catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : 'Failed to process expense document');
    }
});
//# sourceMappingURL=expenseController.js.map