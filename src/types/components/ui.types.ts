// UI component prop types

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export interface FormattedDateProps {
  date: string | Date;
  format?: string;
}

export interface FormattedCurrencyProps {
  amount: number;
  currency?: string;
}

export interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
}

export interface TokenStatusProps {
  isValid: boolean;
  expiresAt?: string;
}

export interface DateRangeFilterProps {
  startDate?: string;
  endDate?: string;
  onRangeChange: (start: string, end: string) => void;
  presets?: Array<{ label: string; value: string }>;
}

export interface DashboardChartProps {
  data: Array<{ label: string; value: number }>;
  title?: string;
  type?: 'line' | 'bar' | 'pie';
}

export interface ConnectionLostDialogProps {
  isOpen: boolean;
  onRetry: () => void;
}

export interface InternationalAddressFormProps {
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  country?: string;
}
