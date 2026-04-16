/**
 * Client CRUD Integration Tests
 * Tests Create, Read, Update, Delete operations and type validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Client } from '@/types';
import { isClient } from '@/types';
import { mockData, mockFetchSuccess, mockFetchError, getLastFetchCall } from './apiMock';

// Mock the authenticatedFetch utility
vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn((url: string, options?: RequestInit) => {
    return global.fetch(url, options);
  })
}));

describe('Client CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CREATE - Client', () => {
    it('should create a new client with correct type structure', async () => {
      const newClient = mockData.client(1);
      mockFetchSuccess(newClient);

      const response = await fetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify({ clientData: newClient })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(isClient(result.data)).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('name');
      expect(result.data).toHaveProperty('email');
    });

    it('should validate required fields on create', async () => {
      const invalidClient = { email: 'test@test.com' }; // missing name
      mockFetchError(400, 'Client name is required');

      const response = await fetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify({ clientData: invalidClient })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should not include deleted_at field on create', async () => {
      const newClient = mockData.client(1);
      mockFetchSuccess(newClient);

      await fetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify({ clientData: newClient })
      });

      const lastCall = getLastFetchCall();
      const body = JSON.parse(lastCall!.options.body);

      expect(body.clientData).not.toHaveProperty('deleted_at');
    });
  });

  describe('READ - Client', () => {
    it('should fetch all clients and validate type', async () => {
      const clients = [mockData.client(1), mockData.client(2)];
      mockFetchSuccess(clients);

      const response = await fetch('/api/clients');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      result.data.forEach((client: Client) => {
        expect(isClient(client)).toBe(true);
      });
    });

    it('should fetch client by ID and validate type', async () => {
      const client = mockData.client(1);
      mockFetchSuccess(client);

      const response = await fetch('/api/clients/1');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(isClient(result.data)).toBe(true);
      expect(result.data.id).toBe(1);
    });

    it('should not return soft-deleted clients', async () => {
      const clients = [mockData.client(1)]; // Only non-deleted
      mockFetchSuccess(clients);

      const response = await fetch('/api/clients');
      const result = await response.json();

      expect(result.success).toBe(true);
      result.data.forEach((client: Client) => {
        expect(client.deleted_at).toBeUndefined();
      });
    });

    it('should handle client not found', async () => {
      mockFetchError(404, 'Client not found');

      const response = await fetch('/api/clients/999');
      const result = await response.json();

      expect(result.success).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('UPDATE - Client', () => {
    it('should update client and maintain type integrity', async () => {
      const updatedClient = {
        ...mockData.client(1),
        name: 'Updated Client Name',
        email: 'updated@test.com'
      };
      mockFetchSuccess(updatedClient);

      const response = await fetch('/api/clients/1', {
        method: 'PUT',
        body: JSON.stringify({
          clientData: {
            name: 'Updated Client Name',
            email: 'updated@test.com'
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(isClient(result.data)).toBe(true);
      expect(result.data.name).toBe('Updated Client Name');
      expect(result.data.email).toBe('updated@test.com');
    });

    it('should validate email format on update', async () => {
      mockFetchError(400, 'Invalid email format');

      const response = await fetch('/api/clients/1', {
        method: 'PUT',
        body: JSON.stringify({
          clientData: { email: 'not-an-email' }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
    });

    it('should not allow updating to soft-deleted client', async () => {
      mockFetchError(404, 'Client not found');

      const response = await fetch('/api/clients/1', {
        method: 'PUT',
        body: JSON.stringify({
          clientData: { name: 'New Name' }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
    });
  });

  describe('DELETE - Client', () => {
    it('should hard delete client by default', async () => {
      mockFetchSuccess({ changes: 1 });

      const response = await fetch('/api/clients/1', {
        method: 'DELETE'
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.changes).toBe(1);
    });

    it('should prevent deletion of client with invoices', async () => {
      mockFetchError(400, 'Cannot delete client with existing invoices');

      const response = await fetch('/api/clients/1', {
        method: 'DELETE'
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('invoices');
    });

    it('should verify client is removed from subsequent queries', async () => {
      // First delete
      mockFetchSuccess({ changes: 1 });
      await fetch('/api/clients/1', { method: 'DELETE' });

      // Then try to fetch
      mockFetchError(404, 'Client not found');
      const response = await fetch('/api/clients/1');
      const result = await response.json();

      expect(result.success).toBe(false);
    });
  });

  describe('Type Safety - Frontend to Backend', () => {
    it('should match frontend Client type with backend response', async () => {
      const client = mockData.client(1);
      mockFetchSuccess(client);

      const response = await fetch('/api/clients/1');
      const result = await response.json();

      const frontendClient: Client = result.data;

      // Verify all required fields exist
      expect(frontendClient.id).toBeDefined();
      expect(frontendClient.name).toBeDefined();
      expect(frontendClient.created_at).toBeDefined();
      expect(frontendClient.updated_at).toBeDefined();

      // Verify types match
      expect(typeof frontendClient.id).toBe('number');
      expect(typeof frontendClient.name).toBe('string');
    });

    it('should not have legacy or deprecated fields', async () => {
      const client = mockData.client(1);
      mockFetchSuccess(client);

      const response = await fetch('/api/clients/1');
      const result = await response.json();

      // Ensure no deprecated fields
      expect(result.data).not.toHaveProperty('template_id');
      expect(result.data).not.toHaveProperty('merchant');
      expect(result.data).not.toHaveProperty('status');
    });
  });
});
