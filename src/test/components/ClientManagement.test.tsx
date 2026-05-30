import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientManagement } from '@/components/ClientManagement';
import { authenticatedFetch } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn()
}));

describe('ClientManagement search behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not crash when searching with clients that have null company', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 101,
            name: 'Alice Example',
            email: 'alice@example.com',
            company: null,
            created_at: '2026-05-30T22:00:00.000Z',
            updated_at: '2026-05-30T22:00:00.000Z'
          },
          {
            id: 102,
            name: 'John Smith',
            email: 'john@example.com',
            company: null,
            created_at: '2026-05-30T23:00:00.000Z',
            updated_at: '2026-05-30T23:00:00.000Z'
          }
        ]
      })
    } as Response);

    render(<ClientManagement />);

    await waitFor(() => {
      expect(screen.getByText('Clients')).toBeInTheDocument();
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search clients...');
    expect(() => fireEvent.change(searchInput, { target: { value: 'john smith' } })).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText('Clients')).toBeInTheDocument();
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.queryByText('Alice Example')).not.toBeInTheDocument();
    });
  });
});
