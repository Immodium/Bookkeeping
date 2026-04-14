import type { DateRange, TimePeriod } from '@/types';

type DateFilterTarget = Record<string, unknown>;

export const getDefaultDateRange = (): DateRange => getDateRangeForPeriod('this-month');

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const shiftDate = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const safeDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getDateRangeForPeriod = (period: TimePeriod): DateRange => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const thisMonthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisMonthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  switch (period) {
    case 'today':
      return { start: todayStart, end: todayEnd };
    case 'yesterday': {
      const yesterday = shiftDate(now, -1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case 'last-7-days':
      return { start: startOfDay(shiftDate(now, -6)), end: todayEnd };
    case 'last-30-days':
      return { start: startOfDay(shiftDate(now, -29)), end: todayEnd };
    case 'this-week': {
      const weekday = now.getDay();
      const weekStart = shiftDate(now, -weekday);
      const weekEnd = shiftDate(weekStart, 6);
      return { start: startOfDay(weekStart), end: endOfDay(weekEnd) };
    }
    case 'last-week': {
      const weekday = now.getDay();
      const thisWeekStart = shiftDate(now, -weekday);
      const lastWeekStart = shiftDate(thisWeekStart, -7);
      const lastWeekEnd = shiftDate(lastWeekStart, 6);
      return { start: startOfDay(lastWeekStart), end: endOfDay(lastWeekEnd) };
    }
    case 'this-month':
      return { start: thisMonthStart, end: thisMonthEnd };
    case 'last-month': {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { start, end };
    }
    case 'this-quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = startOfDay(new Date(now.getFullYear(), quarterStartMonth, 1));
      const end = endOfDay(new Date(now.getFullYear(), quarterStartMonth + 3, 0));
      return { start, end };
    }
    case 'last-quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3 - 3;
      const year = quarterStartMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const normalizedMonth = (quarterStartMonth + 12) % 12;
      const start = startOfDay(new Date(year, normalizedMonth, 1));
      const end = endOfDay(new Date(year, normalizedMonth + 3, 0));
      return { start, end };
    }
    case 'this-year': {
      const start = startOfDay(new Date(now.getFullYear(), 0, 1));
      const end = endOfDay(new Date(now.getFullYear(), 11, 31));
      return { start, end };
    }
    case 'last-year': {
      const year = now.getFullYear() - 1;
      const start = startOfDay(new Date(year, 0, 1));
      const end = endOfDay(new Date(year, 11, 31));
      return { start, end };
    }
    case 'year-to-date': {
      const start = startOfDay(new Date(now.getFullYear(), 0, 1));
      return { start, end: todayEnd };
    }
    case 'month-to-date':
      return { start: thisMonthStart, end: todayEnd };
    case 'custom':
    default:
      return { start: thisMonthStart, end: thisMonthEnd };
  }
};

export const filterByDateRange = <T extends DateFilterTarget>(
  items: T[],
  dateRange: DateRange,
  dateField: keyof T
): T[] =>
  items.filter(item => {
    const itemDate = safeDate(item[dateField]);
    if (!itemDate) {
      return false;
    }
    return itemDate >= dateRange.start && itemDate <= dateRange.end;
  });

export const formatDateRangeLabel = (range: DateRange): string => {
  const format = (date: Date) =>
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${format(range.start)} - ${format(range.end)}`;
};

export const dateRangeFilterOptions: Array<{ value: TimePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last-7-days', label: 'Last 7 Days' },
  { value: 'last-30-days', label: 'Last 30 Days' },
  { value: 'this-week', label: 'This Week' },
  { value: 'last-week', label: 'Last Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'this-year', label: 'This Year' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'year-to-date', label: 'Year to Date' },
  { value: 'month-to-date', label: 'Month to Date' },
  { value: 'custom', label: 'Custom Range' }
];
