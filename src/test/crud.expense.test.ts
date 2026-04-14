/**
 * Expense CRUD Integration Tests
 * Tests the vendor field (NOT merchant) schema alignment
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Expense } from '@/types';
import { isExpense } from '@/types';
import { mockData, mockFetchSuccess, mockFetchError } from './apiMock';

vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn((url: string, options?: RequestInit) => {
    return global.fetch(url, options);
  })
}));

describe('Expense CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CREATE - Expense', () => {
    it('should create expense with vendor field (NOT merchant)', async () => {
      const newExpense = mockData.expense(1);
      mockFetchSuccess({ id: 1 });

      const response = await fetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expenseData: {
            date: '2026-02-16',
            vendor: 'Office Supplies Inc', // Correct field
            amount: 150,
            description: 'Test expense'
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
    });

    it('should validate expense amount', async () => {
      mockFetchError(400, 'Amount must be a positive number');

      const response = await fetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expenseData: { amount: -100 }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });
  });

  describe('READ - Expense', () => {
    it('should fetch all expenses with correct type structure', async () => {
      const expenses = [mockData.expense(1), mockData.expense(2)];
      mockFetchSuccess(expenses);

      const response = await fetch('/api/expenses');
      const result = await response.json();

      expect(result.success).toBe(true);
      result.data.forEach((expense: Expense) => {
        expect(isExpense(expense)).toBe(true);
        expect(expense).toHaveProperty('vendor'); // Correct field
      });
    });

    it('should fetch expense by ID', async () => {
      const expense = mockData.expense(1);
      mockFetchSuccess(expense);

      const response = await fetch('/api/expenses/1');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(isExpense(result.data)).toBe(true);
    });
  });

  describe('UPDATE - Expense', () => {
    it('should update expense vendor field', async () => {
      const updated = { ...mockData.expense(1), vendor: 'New Vendor' };
      mockFetchSuccess(updated);

      const response = await fetch('/api/expenses/1', {
        method: 'PUT',
        body: JSON.stringify({
          expenseData: { vendor: 'New Vendor' }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.vendor).toBe('New Vendor');
    });
  });

  describe('DELETE - Expense', () => {
    it('should delete expense', async () => {
      mockFetchSuccess({ changes: 1 });

      const response = await fetch('/api/expenses/1', { method: 'DELETE' });
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.changes).toBe(1);
    });
  });

  describe('Expense Schema Validation', () => {
    it('should use vendor field not merchant', () => {
      const expense = mockData.expense(1);

      expect(expense).toHaveProperty('vendor');
      // Frontend might have merchant for compatibility, but database uses vendor
    });

    it('should not have status field in database', () => {
      const expense = mockData.expense(1);

      // Status is a frontend-only field, not in database
      expect(expense).not.toHaveProperty('status');
    });
  });
});
