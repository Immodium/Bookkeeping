// Usage Metering Service for Slimbooks
// Tracks per-tenant usage metrics by calendar month

import { databaseService } from '../core/DatabaseService.js';

export type UsageMetric = 'invoices_created' | 'clients_created' | 'api_calls' | 'payments_recorded';

const ALL_METRICS: UsageMetric[] = ['invoices_created', 'clients_created', 'api_calls', 'payments_recorded'];

function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

class UsageService {
  /**
   * Atomically increment (or insert) a metric for the current calendar month (YYYY-MM).
   */
  async increment(tenantId: number, metric: UsageMetric, amount: number = 1): Promise<void> {
    try {
      const period = currentPeriod();
      await databaseService.executeQuery(
        `INSERT INTO usage_records (tenant_id, metric, value, period, period_type, updated_at)
         VALUES (?, ?, ?, ?, 'monthly', NOW())
         ON CONFLICT(tenant_id, metric, period)
         DO UPDATE SET value = value + ?, updated_at = NOW()`,
        [tenantId, metric, amount, period, amount]
      );
    } catch {
      // Never throw from increment — silent on failure
    }
  }

  /**
   * Returns usage for a tenant across all metrics for a given period (defaults to current month).
   */
  async getUsageSummary(tenantId: number, period?: string): Promise<Record<UsageMetric, number>> {
    const targetPeriod = period || currentPeriod();
    const rows = await databaseService.getMany<{ metric: string; value: number }>(
      'SELECT metric, value FROM usage_records WHERE tenant_id = ? AND period = ?',
      [tenantId, targetPeriod]
    );

    const result: Record<UsageMetric, number> = {
      invoices_created: 0,
      clients_created: 0,
      api_calls: 0,
      payments_recorded: 0
    };

    for (const row of rows) {
      if (ALL_METRICS.includes(row.metric as UsageMetric)) {
        result[row.metric as UsageMetric] = row.value;
      }
    }

    return result;
  }

  /**
   * Returns time-series usage for a specific metric.
   */
  async getMetricHistory(
    tenantId: number,
    metric: UsageMetric,
    months: number = 6
  ): Promise<Array<{ period: string; value: number }>> {
    const rows = await databaseService.getMany<{ period: string; value: number }>(
      `SELECT period, value FROM usage_records
       WHERE tenant_id = ? AND metric = ?
       ORDER BY period DESC
       LIMIT ?`,
      [tenantId, metric, months]
    );
    return rows.reverse(); // oldest first
  }
}

export const usageService = new UsageService();
