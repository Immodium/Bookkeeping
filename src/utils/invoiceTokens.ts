// Invoice token generation utilities

export const generateInvoiceToken = (invoiceId: string): string => {
  return btoa(`invoice-${invoiceId}-${new Date().toDateString()}`);
};