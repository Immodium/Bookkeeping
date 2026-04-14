import { JwtPayload } from "jsonwebtoken";
import { InvoiceWithClient } from "./index.js";

/**
 * Public invoice token payload interface
 */
export interface PublicInvoiceTokenPayload extends JwtPayload {
  invoiceId: number;
  type: string;
}

/**
 * Public invoice display interface
 */
export interface PublicInvoiceDisplay extends InvoiceWithClient {
  companySettings?: any;
  currencySettings?: any;
  invoiceTemplate?: string;
}