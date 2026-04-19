/**
 * Payment CRUD Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Payment } from '@/types';
import { isPayment } from '@/types';
import { mockData, mockFetchSuccess, mockFetchError } from './apiMock';

vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn((url: string, options?: RequestInit) => {
    return global.fetch(url, options);
  })
}));

describe('Payment CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CREATE - Payment', () => {
    it('should create payment with correct type structure', async () => {
      const newPayment = mockData.payment(1, 1);
      mockFetchSuccess({ id: 1 });

      const response = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ paymentData: newPayment })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
    });

    it('should validate required payment fields', async () => {
      mockFetchError(400, 'Payment amount is required');

      const response = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ paymentData: { client_name: 'Test' } })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('READ - Payment', () => {
    it('should fetch all payments with correct types', async () => {
      const payments = [mockData.payment(1, 1), mockData.payment(2, 1)];
      mockFetchSuccess(payments);

      const response = await fetch('/api/payments');
      const result = await response.json();

      expect(result.success).toBe(true);
      result.data.forEach((payment: Payment) => {
        expect(isPayment(payment)).toBe(true);
      });
    });

    it('should fetch payment by ID', async () => {
      const payment = mockData.payment(1, 1);
      mockFetchSuccess(payment);

      const response = await fetch('/api/payments/1');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(isPayment(result.data)).toBe(true);
    });
  });

  describe('UPDATE - Payment', () => {
    it('should update payment status', async () => {
      const updated = { ...mockData.payment(1, 1), status: 'failed' };
      mockFetchSuccess(updated);

      const response = await fetch('/api/payments/1', {
        method: 'PUT',
        body: JSON.stringify({ paymentData: { status: 'failed' } })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('failed');
    });
  });

  describe('DELETE - Payment', () => {
    it('should delete payment', async () => {
      mockFetchSuccess({ changes: 1 });

      const response = await fetch('/api/payments/1', { method: 'DELETE' });
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.changes).toBe(1);
    });
  });
});
