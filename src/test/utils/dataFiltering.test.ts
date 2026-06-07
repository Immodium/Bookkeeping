import { describe, expect, it } from 'vitest';
import {
  getDateRangeForPeriod,
  getDefaultDateRange,
  filterByDateRange,
  formatDateRangeLabel,
  dateRangeFilterOptions
} from '@/utils/data/filtering.util';

/**
 * Unit tests for the shared date-range filtering utilities used across the
 * invoice / client / expense / payment list views. Assertions are written
 * relative to "now" (structural properties), not hard-coded dates, so they
 * don't go stale.
 */

describe('getDateRangeForPeriod', () => {
  it('every period returns a valid range with start <= end', () => {
    for (const { value } of dateRangeFilterOptions) {
      const { start, end } = getDateRangeForPeriod(value);
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it('"today" spans the start and end of the current day', () => {
    const now = new Date();
    const { start, end } = getDateRangeForPeriod('today');
    expect(start.getDate()).toBe(now.getDate());
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('"this-month" starts on the 1st of the current month', () => {
    const now = new Date();
    const { start } = getDateRangeForPeriod('this-month');
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(now.getMonth());
    expect(start.getFullYear()).toBe(now.getFullYear());
  });

  it('"all-time" is an extremely wide range (1970 → 9999)', () => {
    const { start, end } = getDateRangeForPeriod('all-time');
    expect(start.getFullYear()).toBe(1970);
    expect(end.getFullYear()).toBe(9999);
  });

  it('"last-7-days" covers a 7-day window ending today', () => {
    const { start, end } = getDateRangeForPeriod('last-7-days');
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBe(7); // start-of-day 6 days ago → end-of-day today ≈ 7 calendar days
  });

  it('"this-year" runs Jan 1 → Dec 31 of the current year', () => {
    const now = new Date();
    const { start, end } = getDateRangeForPeriod('this-year');
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
    expect(start.getFullYear()).toBe(now.getFullYear());
  });

  it('unknown/custom period falls back to the current month (default branch)', () => {
    const custom = getDateRangeForPeriod('custom');
    const thisMonth = getDateRangeForPeriod('this-month');
    expect(custom.start.getTime()).toBe(thisMonth.start.getTime());
    expect(custom.end.getTime()).toBe(thisMonth.end.getTime());
  });

  it('getDefaultDateRange equals the this-month range', () => {
    const def = getDefaultDateRange();
    const thisMonth = getDateRangeForPeriod('this-month');
    expect(def.start.getTime()).toBe(thisMonth.start.getTime());
    expect(def.end.getTime()).toBe(thisMonth.end.getTime());
  });
});

describe('filterByDateRange', () => {
  const range = {
    start: new Date('2026-01-01T00:00:00'),
    end: new Date('2026-12-31T23:59:59')
  };

  it('keeps items whose date field falls within the range (happy path)', () => {
    const items = [
      { id: 1, date: '2026-06-15' },
      { id: 2, date: '2026-01-01' },
      { id: 3, date: '2026-12-31' }
    ];
    expect(filterByDateRange(items, range, 'date').map(i => i.id)).toEqual([1, 2, 3]);
  });

  it('excludes items outside the range', () => {
    const items = [
      { id: 1, date: '2025-12-31' },
      { id: 2, date: '2027-01-01' }
    ];
    expect(filterByDateRange(items, range, 'date')).toHaveLength(0);
  });

  it('excludes items with null/undefined/invalid date values (edge + invalid)', () => {
    const items = [
      { id: 1, date: null },
      { id: 2, date: undefined },
      { id: 3, date: 'not-a-date' },
      { id: 4, date: '' },
      { id: 5, date: '2026-05-05' }
    ];
    expect(filterByDateRange(items as any, range, 'date').map(i => i.id)).toEqual([5]);
  });

  it('accepts Date objects as well as strings', () => {
    const items = [{ id: 1, date: new Date('2026-03-03T12:00:00') }];
    expect(filterByDateRange(items, range, 'date')).toHaveLength(1);
  });

  it('returns an empty array for empty input', () => {
    expect(filterByDateRange([], range, 'date' as never)).toEqual([]);
  });
});

describe('formatDateRangeLabel & options', () => {
  it('formats a range as "<start> - <end>"', () => {
    const label = formatDateRangeLabel({
      start: new Date('2026-01-01T00:00:00'),
      end: new Date('2026-01-31T23:59:59')
    });
    expect(label).toContain(' - ');
    expect(label).toMatch(/2026/);
  });

  it('exposes a stable set of selectable period options', () => {
    expect(dateRangeFilterOptions.length).toBeGreaterThanOrEqual(15);
    const values = dateRangeFilterOptions.map(o => o.value);
    expect(values).toContain('all-time');
    expect(values).toContain('this-month');
    expect(values).toContain('custom');
  });
});
