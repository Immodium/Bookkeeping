import { describe, expect, it } from 'vitest';
import {
  parseCurrencyAmount,
  extractAmountFromReceiptText
} from '../../../server/services/ReceiptOCRService.js';

/**
 * Unit tests for the pure receipt-parsing helpers in ReceiptOCRService.
 * These back the receipt-OCR expense feature (the Tesseract step itself is I/O
 * and is exercised in the manual/API walkthrough). Here we lock down the
 * amount-extraction logic that decides what dollar value lands on an expense.
 */

describe('parseCurrencyAmount', () => {
  it('parses plain decimal amounts (happy path)', () => {
    expect(parseCurrencyAmount('12.99')).toBe(12.99);
    expect(parseCurrencyAmount('29.14')).toBe(29.14);
    expect(parseCurrencyAmount('8.50')).toBe(8.5);
  });

  it('handles currency symbols and surrounding whitespace', () => {
    expect(parseCurrencyAmount(' $ 8.50 ')).toBe(8.5);
    expect(parseCurrencyAmount('£19.99')).toBe(19.99);
    expect(parseCurrencyAmount('€5,00')).toBe(5); // comma as decimal separator
  });

  it('handles thousands separators (US and European notation)', () => {
    expect(parseCurrencyAmount('$1,234.56')).toBe(1234.56);
    expect(parseCurrencyAmount('1.234,56')).toBe(1234.56); // European: . thousands, , decimal
    expect(parseCurrencyAmount('1,000')).toBe(1000); // comma as thousands (3 trailing digits)
  });

  it('returns undefined for empty / non-numeric / zero / negative values (edge + invalid)', () => {
    expect(parseCurrencyAmount('')).toBeUndefined();
    expect(parseCurrencyAmount('   ')).toBeUndefined();
    expect(parseCurrencyAmount('abc')).toBeUndefined();
    expect(parseCurrencyAmount('$')).toBeUndefined();
    expect(parseCurrencyAmount('0.00')).toBeUndefined(); // must be > 0
    expect(parseCurrencyAmount('-5.00')).toBeUndefined(); // negatives rejected
  });

  it('respects the allowImpliedCents option for integer blobs', () => {
    expect(parseCurrencyAmount('2914', { allowImpliedCents: true })).toBe(29.14);
    expect(parseCurrencyAmount('2914')).toBe(2914); // default: literal integer
  });
});

describe('extractAmountFromReceiptText', () => {
  const HARDWARE_RECEIPT = [
    'CITY HARDWARE STORE',
    '123 Main Street',
    'Date: 05/14/2026',
    'Hammer 12.99',
    'Box of Nails 5.49',
    'Tape Measure 8.50',
    'SUBTOTAL 26.98',
    'TAX 2.16',
    'TOTAL 29.14',
    'VISA ************1234'
  ].join('\n');

  it('extracts the TOTAL (largest labeled amount) from a realistic receipt', () => {
    // SUBTOTAL 26.98 and TOTAL 29.14 are both "labeled"; the max is the true total.
    expect(extractAmountFromReceiptText(HARDWARE_RECEIPT)).toBe(29.14);
  });

  it('finds a labeled total written inline', () => {
    expect(extractAmountFromReceiptText('Amount Due: $50.00')).toBe(50);
    expect(extractAmountFromReceiptText('Grand Total   1,250.75')).toBe(1250.75);
  });

  it('falls back to the largest currency value when nothing is labeled', () => {
    expect(extractAmountFromReceiptText('Coffee 4.50\nPastry 3.25')).toBe(4.5);
  });

  it('returns undefined for empty text or text with no amounts (edge cases)', () => {
    expect(extractAmountFromReceiptText('')).toBeUndefined();
    expect(extractAmountFromReceiptText('   \n  ')).toBeUndefined();
    expect(extractAmountFromReceiptText('no numbers here at all')).toBeUndefined();
  });

  it('reads an amount from the line following a bare total label', () => {
    expect(extractAmountFromReceiptText('TOTAL\n$72.40')).toBe(72.4);
  });
});
