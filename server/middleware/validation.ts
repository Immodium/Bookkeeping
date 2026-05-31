// Validation middleware for Slimbooks
// Handles input validation, sanitization, and validation rules

import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { validationConfig, serverConfig } from '../config/index.js';

interface SQLSanitizeResult {
  query: string;
  params: unknown[];
}

/**
 * Middleware to check validation results
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
    return;
  }
  next();
};

/**
 * Common validation rules
 */
export const validationRules = {
  // User validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address')
    .isLength({ max: validationConfig.maxFieldLengths.email })
    .withMessage(`Email must be less than ${validationConfig.maxFieldLengths.email} characters`),
  
  password: body('password')
    .isLength({ 
      min: validationConfig.password.minLength, 
      max: validationConfig.password.maxLength 
    })
    .withMessage(`Password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`),
  
  name: body('name')
    .trim()
    .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
    .withMessage(`Name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
    .escape(),
  
  // ID validation
  id: param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  
  // Invoice validation
  invoiceNumber: body('invoice_number')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invoice number must be between 1 and 50 characters')
    .escape(),
  
  amount: body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  
  // Client validation
  clientName: body('name')
    .trim()
    .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
    .withMessage(`Client name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
    .escape(),
  
  clientEmail: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  
  // Settings validation
  settingsKey: body('key')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Settings key must contain only alphanumeric characters, dots, hyphens, and underscores'),
  
  // Date validation
  date: body('date')
    .isISO8601()
    .withMessage('Date must be in ISO 8601 format'),
  
  // Description validation
  description: body('description')
    .optional()
    .trim()
    .isLength({ max: validationConfig.maxFieldLengths.description })
    .withMessage(`Description must be less than ${validationConfig.maxFieldLengths.description} characters`)
    .escape(),
  
  // Notes validation
  notes: body('notes')
    .optional()
    .trim()
    .isLength({ max: validationConfig.maxFieldLengths.notes })
    .withMessage(`Notes must be less than ${validationConfig.maxFieldLengths.notes} characters`)
    .escape(),
  
  // Phone validation
  phone: body('phone')
    .optional()
    .isMobilePhone('en-US')
    .withMessage('Must be a valid phone number'),
  
  // Status validation
  status: body('status')
    .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled'),
  
  // Role validation
  role: body('role')
    .isIn(['admin', 'client_manager', 'project_manager', 'user_manager', 'user', 'viewer'])
    .withMessage('Role must be one of admin, client_manager, project_manager, user_manager, user, viewer'),
  
  // Category validation (for expenses)
  category: body('category')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be between 1 and 50 characters')
    .escape(),
  
  // Merchant validation (for expenses)
  merchant: body('merchant')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Merchant must be between 1 and 100 characters')
    .escape()
};

/**
 * Validation rule sets for different endpoints
 */
export const validationSets = {
  // User validation sets
  createUser: [
    validationRules.name,
    validationRules.email,
    validationRules.password,
    validationRules.role
  ] as ValidationChain[],
  
  inviteUser: [
    body('inviteData.name')
      .trim()
      .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
      .escape(),
    body('inviteData.email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address')
      .isLength({ max: validationConfig.maxFieldLengths.email })
      .withMessage(`Email must be less than ${validationConfig.maxFieldLengths.email} characters`),
    body('inviteData.roles')
      .isArray({ min: 1 })
      .withMessage('At least one role is required'),
    body('inviteData.roles.*')
      .isIn(['admin', 'client_manager', 'project_manager', 'user_manager', 'user', 'viewer'])
      .withMessage('Invalid role provided')
  ] as ValidationChain[],
  
  adminResetPassword: [
    validationRules.id,
    body('newPassword')
      .isLength({
        min: validationConfig.password.minLength,
        max: validationConfig.password.maxLength
      })
      .withMessage(`Password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`)
  ] as ValidationChain[],

  createTenant: [
    body('tenantData.name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage('Tenant name must be between 2 and 120 characters'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage('Tenant name must be between 2 and 120 characters'),
    body('tenantData.slug')
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9-]+$/)
      .withMessage('Tenant slug may only include letters, numbers, and hyphens'),
    body('slug')
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9-]+$/)
      .withMessage('Tenant slug may only include letters, numbers, and hyphens'),
    body('tenantData.admin.name')
      .optional()
      .trim()
      .isLength({ min: 2, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Admin name must be between 2 and ${validationConfig.maxFieldLengths.name} characters`),
    body('admin.name')
      .optional()
      .trim()
      .isLength({ min: 2, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Admin name must be between 2 and ${validationConfig.maxFieldLengths.name} characters`),
    body('tenantData.admin.email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Admin email must be a valid email address'),
    body('admin.email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Admin email must be a valid email address'),
    body('tenantData.admin.password')
      .optional()
      .isLength({ min: validationConfig.password.minLength, max: validationConfig.password.maxLength })
      .withMessage(`Admin password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`),
    body('admin.password')
      .optional()
      .isLength({ min: validationConfig.password.minLength, max: validationConfig.password.maxLength })
      .withMessage(`Admin password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`)
  ] as ValidationChain[],

  bootstrapTenantAdmin: [
    validationRules.id,
    body('admin.name')
      .optional()
      .trim()
      .isLength({ min: 2, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Admin name must be between 2 and ${validationConfig.maxFieldLengths.name} characters`),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Admin name must be between 2 and ${validationConfig.maxFieldLengths.name} characters`),
    body('admin.email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Admin email must be a valid email address'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Admin email must be a valid email address'),
    body('admin.password')
      .optional()
      .isLength({ min: validationConfig.password.minLength, max: validationConfig.password.maxLength })
      .withMessage(`Admin password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`),
    body('password')
      .optional()
      .isLength({ min: validationConfig.password.minLength, max: validationConfig.password.maxLength })
      .withMessage(`Admin password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`)
  ] as ValidationChain[],

  updateTenantStatus: [
    validationRules.id,
    body('status')
      .isIn(['active', 'suspended', 'deleted'])
      .withMessage('Tenant status must be one of: active, suspended, deleted')
  ] as ValidationChain[],

  updateTenantSubscription: [
    validationRules.id,
    body('subscriptionData.planCode')
      .optional()
      .trim()
      .isLength({ min: 2, max: 64 })
      .withMessage('Plan code must be between 2 and 64 characters'),
    body('planCode')
      .optional()
      .trim()
      .isLength({ min: 2, max: 64 })
      .withMessage('Plan code must be between 2 and 64 characters'),
    body('subscriptionData.status')
      .optional()
      .isIn(['trialing', 'active', 'past_due', 'suspended', 'canceled'])
      .withMessage('Invalid subscription status'),
    body('status')
      .optional()
      .isIn(['trialing', 'active', 'past_due', 'suspended', 'canceled'])
      .withMessage('Invalid subscription status'),
    body('subscriptionData.currentPeriodEnd')
      .optional()
      .isISO8601()
      .withMessage('currentPeriodEnd must be a valid ISO date'),
    body('currentPeriodEnd')
      .optional()
      .isISO8601()
      .withMessage('currentPeriodEnd must be a valid ISO date'),
    body('subscriptionData.cancelAtPeriodEnd')
      .optional()
      .isBoolean()
      .withMessage('cancelAtPeriodEnd must be a boolean'),
    body('cancelAtPeriodEnd')
      .optional()
      .isBoolean()
      .withMessage('cancelAtPeriodEnd must be a boolean')
  ] as ValidationChain[],

  updateTenantEntitlements: [
    validationRules.id,
    body('entitlements')
      .optional()
      .isObject()
      .withMessage('entitlements must be an object')
  ] as ValidationChain[],
  
  updateUser: [
    validationRules.id,
    body('name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'client_manager', 'project_manager', 'user_manager', 'user', 'viewer']),
    body('userData.roles').optional().isArray({ min: 1 }),
    body('userData.roles.*').optional().isIn(['admin', 'client_manager', 'project_manager', 'user_manager', 'user', 'viewer'])
  ] as ValidationChain[],
  
  // Client validation sets
  createClient: [
    body('clientData.name')
      .trim()
      .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Client name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
      .escape(),
    body('clientData.email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('clientData.phone').optional().trim().escape(),
    body('clientData.company').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.address').optional().trim().isLength({ max: 200 }).escape(),
    body('clientData.city').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.state').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.zip').optional().trim().isLength({ max: 20 }).escape(),
    body('clientData.zipCode').optional().trim().isLength({ max: 20 }).escape(),
    body('clientData.country').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.tax_id').optional().trim().isLength({ max: 50 }).escape(),
    body('clientData.notes').optional().trim().isLength({ max: 1000 }).escape(),
    body('clientData.is_active').optional().isBoolean()
  ] as ValidationChain[],
  
  updateClient: [
    validationRules.id,
    body('clientData.name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('clientData.email').optional().isEmail().normalizeEmail(),
    body('clientData.phone').optional().trim().escape(),
    body('clientData.company').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.address').optional().trim().isLength({ max: 200 }).escape(),
    body('clientData.city').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.state').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.zip').optional().trim().isLength({ max: 20 }).escape(),
    body('clientData.zipCode').optional().trim().isLength({ max: 20 }).escape(),
    body('clientData.country').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.tax_id').optional().trim().isLength({ max: 50 }).escape(),
    body('clientData.notes').optional().trim().isLength({ max: 1000 }).escape(),
    body('clientData.is_active').optional().isBoolean()
  ] as ValidationChain[],
  
  // Invoice validation sets
  createInvoice: [
    body('invoiceData.invoice_number')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invoice number must be between 1 and 50 characters')
      .escape(),
    body('invoiceData.client_id').isInt({ min: 1 }).withMessage('Client ID must be a positive integer'),
    body('invoiceData.amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('invoiceData.tax_amount').optional().isFloat({ min: 0 }).withMessage('Tax amount must be positive'),
    body('invoiceData.due_date').optional().isISO8601().withMessage('Due date must be in ISO 8601 format'),
    body('invoiceData.issue_date').optional().isISO8601().withMessage('Issue date must be in ISO 8601 format'),
    body('invoiceData.description')
      .optional()
      .trim()
      .isLength({ max: validationConfig.maxFieldLengths.description })
      .withMessage(`Description must be less than ${validationConfig.maxFieldLengths.description} characters`)
      .escape(),
    body('invoiceData.status')
      .optional()
      .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'])
      .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled, refunded')
  ] as ValidationChain[],
  
  updateInvoice: [
    validationRules.id,
    body('invoiceData.invoice_number').optional().trim().isLength({ min: 1, max: 50 }).escape(),
    body('invoiceData.client_id').optional().isInt({ min: 1 }),
    body('invoiceData.amount').optional().isFloat({ min: 0 }),
    body('invoiceData.tax_amount').optional().isFloat({ min: 0 }),
    body('invoiceData.due_date').optional().isISO8601(),
    body('invoiceData.issue_date').optional().isISO8601(),
    body('invoiceData.description').optional().trim().isLength({ max: validationConfig.maxFieldLengths.description }).escape(),
    body('invoiceData.status').optional().isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'])
  ] as ValidationChain[],
  
  // Expense validation sets
  createExpense: [
    body('expenseData.date').isISO8601().withMessage('Date must be in ISO 8601 format'),
    body('expenseData.vendor')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Vendor must be between 1 and 100 characters')
      .escape(),
    body('expenseData.category')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Category must be between 1 and 50 characters')
      .escape(),
    body('expenseData.amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('expenseData.description')
      .optional()
      .trim()
      .isLength({ max: validationConfig.maxFieldLengths.description })
      .withMessage(`Description must be less than ${validationConfig.maxFieldLengths.description} characters`)
      .escape(),
    body('expenseData.status').optional().isIn(['pending', 'approved', 'rejected'])
  ] as ValidationChain[],
  
  updateExpense: [
    validationRules.id,
    body('expenseData.date').optional().isISO8601(),
    body('expenseData.vendor').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('expenseData.category').optional().trim().isLength({ min: 1, max: 50 }).escape(),
    body('expenseData.amount').optional().isFloat({ min: 0 }),
    body('expenseData.description').optional().trim().isLength({ max: validationConfig.maxFieldLengths.description }).escape(),
    body('expenseData.status').optional().isIn(['pending', 'approved', 'rejected'])
  ] as ValidationChain[],
  
  // Payment validation sets
  getPayments: [
    query('status').optional().isIn(['received', 'pending', 'failed', 'refunded']),
    query('method').optional().trim().isLength({ max: 50 }),
    query('date_from').optional().isISO8601(),
    query('date_to').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ] as ValidationChain[],
  
  getPaymentById: [
    validationRules.id
  ] as ValidationChain[],
  
  createPayment: [
    body('paymentData.date').isISO8601().withMessage('Date must be in ISO 8601 format'),
    body('paymentData.client_name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Client name must be between 1 and 100 characters')
      .escape(),
    body('paymentData.client_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Client ID must be a positive integer'),
    body('paymentData')
      .custom((paymentData) => {
        if (!paymentData || (!paymentData.client_name && !paymentData.client_id)) {
          throw new Error('Either client_name or client_id is required');
        }
        return true;
      }),
    body('paymentData.amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('paymentData.method').isIn(['cash', 'check', 'bank_transfer', 'credit_card', 'paypal', 'other']).withMessage('Invalid payment method'),
    body('paymentData.invoice_id').optional().isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer'),
    body('paymentData.reference').optional().trim().isLength({ max: 100 }).escape(),
    body('paymentData.description').optional().trim().isLength({ max: 500 }).escape(),
    body('paymentData.status').optional().isIn(['received', 'pending', 'failed', 'refunded'])
  ] as ValidationChain[],
  
  updatePayment: [
    validationRules.id,
    body('paymentData.date').optional().isISO8601(),
    body('paymentData.client_name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('paymentData.client_id').optional().isInt({ min: 1 }),
    body('paymentData.amount').optional().isFloat({ min: 0.01 }),
    body('paymentData.method').optional().isIn(['cash', 'check', 'bank_transfer', 'credit_card', 'paypal', 'other']),
    body('paymentData.invoice_id').optional().isInt({ min: 1 }),
    body('paymentData.reference').optional().trim().isLength({ max: 100 }).escape(),
    body('paymentData.description').optional().trim().isLength({ max: 500 }).escape(),
    body('paymentData.status').optional().isIn(['received', 'pending', 'failed', 'refunded'])
  ] as ValidationChain[],
  
  deletePayment: [
    validationRules.id
  ] as ValidationChain[],
  
  getPaymentStats: [
    query('date_from').optional().isISO8601(),
    query('date_to').optional().isISO8601()
  ] as ValidationChain[],
  
  bulkDeletePayments: [
    body('payment_ids').isArray({ min: 1 }).withMessage('Payment IDs array is required'),
    body('payment_ids.*').isInt({ min: 1 }).withMessage('All payment IDs must be positive integers')
  ] as ValidationChain[],

  // Retainer validation sets
  getRetainers: [
    query('status').optional().isIn(['active', 'paused', 'ended']),
    query('billing_cycle').optional().isIn(['weekly', 'monthly', 'quarterly', 'yearly']),
    query('client_id').optional().isInt({ min: 1 }),
    query('search').optional().trim().isLength({ max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ] as ValidationChain[],

  getRetainerById: [
    validationRules.id
  ] as ValidationChain[],

  createRetainer: [
    body('retainerData.client_id').isInt({ min: 1 }).withMessage('Client ID must be a positive integer'),
    body('retainerData.name')
      .trim()
      .isLength({ min: 1, max: 120 })
      .withMessage('Retainer name must be between 1 and 120 characters')
      .escape(),
    body('retainerData.amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('retainerData.currency')
      .optional()
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-letter code')
      .toUpperCase(),
    body('retainerData.billing_cycle')
      .optional()
      .isIn(['weekly', 'monthly', 'quarterly', 'yearly'])
      .withMessage('Billing cycle must be weekly, monthly, quarterly, or yearly'),
    body('retainerData.start_date').isISO8601().withMessage('Start date must be in ISO 8601 format'),
    body('retainerData.next_invoice_date').isISO8601().withMessage('Next invoice date must be in ISO 8601 format'),
    body('retainerData.end_date').optional().isISO8601().withMessage('End date must be in ISO 8601 format'),
    body('retainerData.status')
      .optional()
      .isIn(['active', 'paused', 'ended'])
      .withMessage('Status must be active, paused, or ended'),
    body('retainerData.auto_renew').optional().isBoolean().withMessage('Auto renew must be boolean'),
    body('retainerData.email_schedule_enabled').optional().isBoolean().withMessage('Email schedule enabled must be boolean'),
    body('retainerData.reminder_days_before').optional().isInt({ min: 0, max: 365 }).withMessage('Reminder days before must be between 0 and 365'),
    body('retainerData.auto_overdue_reminders').optional().isBoolean().withMessage('Auto overdue reminders must be boolean'),
    body('retainerData.overdue_reminder_interval_days').optional().isInt({ min: 1, max: 365 }).withMessage('Overdue reminder interval must be between 1 and 365 days'),
    body('retainerData.max_overdue_reminders').optional().isInt({ min: 1, max: 100 }).withMessage('Max overdue reminders must be between 1 and 100'),
    body('retainerData.description').optional().trim().isLength({ max: 1000 }).escape(),
    body('retainerData.notes').optional().trim().isLength({ max: 2000 }).escape()
  ] as ValidationChain[],

  updateRetainer: [
    validationRules.id,
    body('retainerData.client_id').optional().isInt({ min: 1 }),
    body('retainerData.name').optional().trim().isLength({ min: 1, max: 120 }).escape(),
    body('retainerData.amount').optional().isFloat({ min: 0.01 }),
    body('retainerData.currency').optional().trim().isLength({ min: 3, max: 3 }).toUpperCase(),
    body('retainerData.billing_cycle').optional().isIn(['weekly', 'monthly', 'quarterly', 'yearly']),
    body('retainerData.start_date').optional().isISO8601(),
    body('retainerData.next_invoice_date').optional().isISO8601(),
    body('retainerData.end_date').optional().isISO8601(),
    body('retainerData.status').optional().isIn(['active', 'paused', 'ended']),
    body('retainerData.auto_renew').optional().isBoolean(),
    body('retainerData.email_schedule_enabled').optional().isBoolean(),
    body('retainerData.reminder_days_before').optional().isInt({ min: 0, max: 365 }),
    body('retainerData.auto_overdue_reminders').optional().isBoolean(),
    body('retainerData.overdue_reminder_interval_days').optional().isInt({ min: 1, max: 365 }),
    body('retainerData.max_overdue_reminders').optional().isInt({ min: 1, max: 100 }),
    body('retainerData.description').optional().trim().isLength({ max: 1000 }).escape(),
    body('retainerData.notes').optional().trim().isLength({ max: 2000 }).escape()
  ] as ValidationChain[],

  deleteRetainer: [
    validationRules.id
  ] as ValidationChain[],
  
  // Authentication validation sets
  login: [
    validationRules.email,
    validationRules.password
  ] as ValidationChain[],
  
  register: [
    validationRules.name,
    validationRules.email,
    validationRules.password
  ] as ValidationChain[],
  
  forgotPassword: [
    validationRules.email
  ] as ValidationChain[],
  
  resetPassword: [
    body('token').notEmpty().withMessage('Reset token is required'),
    validationRules.password
  ] as ValidationChain[]
};

/**
 * File upload validation middleware
 * @param maxSize - Maximum file size in bytes
 */
const matchesMimeTypePattern = (mimeType: string, pattern: string): boolean => {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, pattern.length - 1);
    return mimeType.startsWith(prefix);
  }

  return mimeType === pattern;
};

export const validateFileUpload = (
  maxSize = serverConfig.maxFileSize,
  allowedMimeTypes: string[] = validationConfig.allowedMimeTypes
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.file && req.file.size > maxSize) {
      res.status(400).json({
        success: false,
        error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
      });
      return;
    }
    
    if (
      req.file &&
      !allowedMimeTypes.some((pattern) => matchesMimeTypePattern(req.file!.mimetype, pattern))
    ) {
      res.status(400).json({
        success: false,
        error: 'Invalid file type.'
      });
      return;
    }
    
    next();
  };
};

/**
 * SQL injection protection for dynamic queries
 * @param query - SQL query
 * @param params - Query parameters
 * @returns Sanitized query and parameters
 */
export const sanitizeSQL = (query: string, params: unknown[] = []): SQLSanitizeResult => {
  // Basic SQL injection protection
  // In production, use parameterized queries exclusively
  const sanitizedParams = params.map(param => {
    if (typeof param === 'string') {
      return param.replace(/['"\\]/g, '');
    }
    return param;
  });
  
  return { query, params: sanitizedParams };
};