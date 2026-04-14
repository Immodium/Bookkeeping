import { z } from 'zod';

// Client validation schema
export const clientSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().default('USA')
});

// Expense validation schema
export const expenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  vendor: z.string().min(1, 'Vendor is required'),
  category: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  status: z.enum(['pending', 'approved', 'reimbursed']).default('pending')
});

// Payment validation schema
export const paymentSchema = z.object({
  invoice_id: z.number().positive('Invoice is required'),
  amount: z.number().positive('Amount must be positive'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  notes: z.string().optional()
});

// Export types from schemas
export type ClientFormData = z.infer<typeof clientSchema>;
export type ExpenseFormData = z.infer<typeof expenseSchema>;
export type PaymentFormData = z.infer<typeof paymentSchema>;
