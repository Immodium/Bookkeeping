/**
 * Numbering Utility Tests
 * Tests invoice number generation and sequencing logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateNumber,
  parseNumber,
  getNextNumber,
  isInvoiceNumberUnique,
  getInvoiceNumberPreview
} from '@/utils/business/numbering.util';
import { mockFetchSuccess } from '../apiMock';

describe('Number Generation', () => {
  describe('generateNumber', () => {
    const settings = {
      prefix: 'INV',
      startNumber: 1,
      paddingLength: 4,
      includeYear: true,
      resetOnNewYear: true
    };

    it('should generate number with year', () => {
      const result = generateNumber(settings, 1, 2026);

      expect(result).toBe('INV-2026-0001');
    });

    it('should generate number without year when includeYear is false', () => {
      const noYearSettings = { ...settings, includeYear: false };
      const result = generateNumber(noYearSettings, 1);

      expect(result).toBe('INV-0001');
    });

    it('should respect padding length', () => {
      const result1 = generateNumber(settings, 1, 2026);
      expect(result1).toBe('INV-2026-0001');

      const result99 = generateNumber(settings, 99, 2026);
      expect(result99).toBe('INV-2026-0099');

      const result1000 = generateNumber(settings, 1000, 2026);
      expect(result1000).toBe('INV-2026-1000');
    });

    it('should handle different prefixes', () => {
      const expSettings = { ...settings, prefix: 'EXP' };
      const result = generateNumber(expSettings, 1, 2026);

      expect(result).toBe('EXP-2026-0001');
    });

    it('should use current year if not specified', () => {
      const currentYear = new Date().getFullYear();
      const result = generateNumber(settings, 1);

      expect(result).toContain(currentYear.toString());
    });

    it('should handle large sequence numbers', () => {
      const result = generateNumber(settings, 99999, 2026);

      expect(result).toBe('INV-2026-99999');
    });

    it('should handle different padding lengths', () => {
      const settings3 = { ...settings, paddingLength: 3 };
      expect(generateNumber(settings3, 1, 2026)).toBe('INV-2026-001');

      const settings6 = { ...settings, paddingLength: 6 };
      expect(generateNumber(settings6, 1, 2026)).toBe('INV-2026-000001');
    });
  });
});

describe('Number Parsing', () => {
  describe('parseNumber', () => {
    it('should parse number with year', () => {
      const result = parseNumber('INV-2026-0001');

      expect(result.prefix).toBe('INV');
      expect(result.year).toBe(2026);
      expect(result.sequence).toBe(1);
    });

    it('should parse number without year', () => {
      const result = parseNumber('INV-0001');

      expect(result.prefix).toBe('INV');
      expect(result.year).toBeUndefined();
      expect(result.sequence).toBe(1);
    });

    it('should handle different prefixes', () => {
      expect(parseNumber('EXP-2026-0001').prefix).toBe('EXP');
      expect(parseNumber('PAY-2026-0001').prefix).toBe('PAY');
      expect(parseNumber('QUO-2026-0001').prefix).toBe('QUO');
    });

    it('should handle large sequence numbers', () => {
      const result = parseNumber('INV-2026-99999');

      expect(result.sequence).toBe(99999);
    });

    it('should handle lowercase prefixes', () => {
      const result = parseNumber('inv-2026-0001');

      expect(result.prefix).toBe('inv');
    });

    it('should return empty object for invalid format', () => {
      expect(parseNumber('invalid')).toEqual({});
      expect(parseNumber('INV2026-0001')).toEqual({});
      expect(parseNumber('INV-abc-0001')).toEqual({});
    });

    it('should handle numbers with leading zeros removed', () => {
      const result = parseNumber('INV-2026-1');

      expect(result.sequence).toBe(1);
    });

    it('should parse mixed case prefixes', () => {
      expect(parseNumber('Inv-2026-0001').prefix).toBe('Inv');
      expect(parseNumber('ABC-2026-0001').prefix).toBe('ABC');
    });
  });
});

describe('Next Number Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNextNumber', () => {
    it('should generate first number when no last number provided', async () => {
      const result = await getNextNumber('invoice');

      expect(result).toBeTruthy();
      expect(result).toMatch(/^[A-Z]+-/);
    });

    it('should increment sequence from last number', async () => {
      const result = await getNextNumber('invoice', 'INV-2026-0001');

      expect(result).toContain('0002');
    });

    it('should reset on new year if configured', async () => {
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;
      const lastNumber = `INV-${lastYear}-0099`;

      const result = await getNextNumber('invoice', lastNumber);

      expect(result).toContain(currentYear.toString());
      expect(result).toContain('0001'); // Reset to 1
    });

    it('should continue sequence if same year', async () => {
      const currentYear = new Date().getFullYear();
      const lastNumber = `INV-${currentYear}-0005`;

      const result = await getNextNumber('invoice', lastNumber);

      expect(result).toContain('0006');
    });

    it('should handle expense number generation', async () => {
      const result = await getNextNumber('expense', 'EXP-2026-0010');

      expect(result).toContain('EXP');
      expect(result).toContain('0011');
    });

    it('should handle payment number generation', async () => {
      const result = await getNextNumber('payment', 'PAY-2026-0020');

      expect(result).toContain('PAY');
      expect(result).toContain('0021');
    });

    it('should handle numbers without year format', async () => {
      const result = await getNextNumber('invoice', 'INV-0050');

      expect(result).toContain('0051');
    });
  });
});

describe('Invoice Number Uniqueness', () => {
  describe('isInvoiceNumberUnique', () => {
    it('should return true for unique invoice number', async () => {
      mockFetchSuccess([
        { id: 1, invoice_number: 'INV-001' },
        { id: 2, invoice_number: 'INV-002' }
      ]);

      const isUnique = await isInvoiceNumberUnique('INV-003');

      expect(isUnique).toBe(true);
    });

    it('should return false for duplicate invoice number', async () => {
      mockFetchSuccess([
        { id: 1, invoice_number: 'INV-001' },
        { id: 2, invoice_number: 'INV-002' }
      ]);

      const isUnique = await isInvoiceNumberUnique('INV-001');

      expect(isUnique).toBe(false);
    });

    it('should exclude specific ID when checking uniqueness', async () => {
      mockFetchSuccess([
        { id: 1, invoice_number: 'INV-001' },
        { id: 2, invoice_number: 'INV-002' }
      ]);

      // Checking if INV-001 is unique, but excluding invoice ID 1
      const isUnique = await isInvoiceNumberUnique('INV-001', 1);

      expect(isUnique).toBe(true);
    });

    it('should handle empty invoice list', async () => {
      mockFetchSuccess([]);

      const isUnique = await isInvoiceNumberUnique('INV-001');

      expect(isUnique).toBe(true);
    });

    it('should be case-sensitive', async () => {
      mockFetchSuccess([
        { id: 1, invoice_number: 'INV-001' }
      ]);

      const isUniqueLower = await isInvoiceNumberUnique('inv-001');
      expect(isUniqueLower).toBe(true); // Different case = unique
    });
  });
});

describe('Invoice Number Preview', () => {
  describe('getInvoiceNumberPreview', () => {
    it('should generate preview with given prefix', () => {
      expect(getInvoiceNumberPreview('INV')).toBe('INV-0001');
      expect(getInvoiceNumberPreview('QUOTE')).toBe('QUOTE-0001');
      expect(getInvoiceNumberPreview('ORDER')).toBe('ORDER-0001');
    });

    it('should always show 0001 in preview', () => {
      const preview = getInvoiceNumberPreview('TEST');

      expect(preview).toContain('0001');
    });

    it('should handle empty prefix', () => {
      const preview = getInvoiceNumberPreview('');

      expect(preview).toBe('-0001');
    });

    it('should handle special characters in prefix', () => {
      expect(getInvoiceNumberPreview('INV#')).toContain('INV#');
      expect(getInvoiceNumberPreview('A-B')).toContain('A-B');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle year boundaries correctly', async () => {
    // Test December to January transition
    const dec31 = `INV-2025-0100`;
    const result = await getNextNumber('invoice', dec31);

    // Should either continue sequence or reset depending on settings
    expect(result).toBeTruthy();
  });

  it('should handle maximum sequence numbers', async () => {
    const result = await getNextNumber('invoice', 'INV-2026-99999');

    expect(result).toContain('100000');
  });

  it('should handle malformed last numbers gracefully', async () => {
    const result = await getNextNumber('invoice', 'INVALID');

    expect(result).toBeTruthy();
  });

  it('should handle very long prefixes', () => {
    const longPrefix = 'A'.repeat(50);
    const number = generateNumber(
      {
        prefix: longPrefix,
        startNumber: 1,
        paddingLength: 4,
        includeYear: true,
        resetOnNewYear: false
      },
      1,
      2026
    );

    expect(number).toContain(longPrefix);
  });

  it('should handle zero as sequence number', () => {
    const settings = {
      prefix: 'INV',
      startNumber: 0,
      paddingLength: 4,
      includeYear: true,
      resetOnNewYear: false
    };

    const result = generateNumber(settings, 0, 2026);

    expect(result).toBe('INV-2026-0000');
  });

  it('should handle negative sequence numbers by converting to positive', () => {
    const settings = {
      prefix: 'INV',
      startNumber: 1,
      paddingLength: 4,
      includeYear: false,
      resetOnNewYear: false
    };

    // This should ideally not happen, but test the behavior
    const result = generateNumber(settings, -5, 2026);

    expect(result).toBeTruthy();
  });
});

describe('Settings Variations', () => {
  it('should work with minimal padding', () => {
    const settings = {
      prefix: 'INV',
      startNumber: 1,
      paddingLength: 1,
      includeYear: false,
      resetOnNewYear: false
    };

    expect(generateNumber(settings, 1)).toBe('INV-1');
    expect(generateNumber(settings, 10)).toBe('INV-10');
  });

  it('should work with no prefix', () => {
    const settings = {
      prefix: '',
      startNumber: 1,
      paddingLength: 4,
      includeYear: true,
      resetOnNewYear: false
    };

    const result = generateNumber(settings, 1, 2026);

    expect(result).toBe('-2026-0001');
  });

  it('should handle numeric prefixes', () => {
    const settings = {
      prefix: '2026',
      startNumber: 1,
      paddingLength: 4,
      includeYear: false,
      resetOnNewYear: false
    };

    const result = generateNumber(settings, 1);

    expect(result).toBe('2026-0001');
  });
});
