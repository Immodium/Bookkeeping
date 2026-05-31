import { BaseEntity } from '../shared/common.types';
import type { CurrencyCode } from '../constants/enums.types';

export type RetainerStatus = 'active' | 'paused' | 'ended';
export type RetainerBillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Retainer extends BaseEntity {
  client_id: number;
  client_name?: string;
  client_email?: string;
  name: string;
  description?: string;
  amount: number;
  currency?: CurrencyCode | string;
  billing_cycle: RetainerBillingCycle;
  start_date: string;
  next_invoice_date: string;
  end_date?: string;
  status: RetainerStatus;
  auto_renew: number;
  notes?: string;
}

export interface RetainerFormData {
  client_id: number;
  name: string;
  description?: string;
  amount: number;
  currency?: CurrencyCode | string;
  billing_cycle: RetainerBillingCycle;
  start_date: string;
  next_invoice_date: string;
  end_date?: string;
  status: RetainerStatus;
  auto_renew: boolean;
  notes?: string;
}

export interface RetainerStats {
  summary: {
    total: number;
    active: number;
    paused: number;
    ended: number;
    total_amount: number;
    monthly_value: number;
  };
  upcoming_next_30_days: number;
  by_billing_cycle: Array<{
    billing_cycle: RetainerBillingCycle;
    count: number;
    total_amount: number;
  }>;
}

export interface RetainerFilters {
  status?: RetainerStatus;
  billing_cycle?: RetainerBillingCycle;
  client_id?: number;
  search?: string;
}
