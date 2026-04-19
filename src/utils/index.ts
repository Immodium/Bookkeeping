// Consolidated utilities barrel exports
// Use these imports instead of individual utility files

// Formatting utilities with settings integration
export * from './formatting';

// Data operations and validation
export * from './data';

// API and networking
export * from './api';

// Business logic utilities
export * from './business';

// Legacy utilities (will be deprecated)
export * from './themeUtils.util';
export * from './emailConfig.util';

// Settings and validation utilities
export * from './settingsValidation';

// Invoice-specific utilities
export * from './invoiceTokens';

// Re-export commonly used functions for backwards compatibility
export { formatCurrency, formatCurrencySync, getCurrencySettings } from './formatting/currency.util';
export { formatDate, formatDateSync, getDateTimeSettings } from './formatting/date.util';
export { formatClientAddress, formatClientAddressSingleLine } from './formatting/address.util';
export { authenticatedFetch, apiGet, apiPost, apiPut, apiDelete } from './api/http.util';
export { validateInvoiceForSave, validateInvoiceForSend } from './data/validation.util';
export { exportToCSV, parseCSV } from './data/import-export.util';
export { filterByDateRange, getDateRangeForPeriod } from './data/filtering.util';