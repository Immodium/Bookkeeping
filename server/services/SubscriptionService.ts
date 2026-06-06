import { databaseService } from '../core/DatabaseService.js';
import { emailProviderService } from './EmailProviderService.js';
import { emailTemplateService } from './EmailTemplateService.js';
import { outboundWebhookService } from './OutboundWebhookService.js';

export type TenantSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled';

export interface SubscriptionPlanRecord {
  id: number;
  code: string;
  name: string;
  status: 'active' | 'inactive';
  price_cents: number;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  trial_days: number;
  features_json?: string;
}

export interface TenantSubscriptionRecord {
  id: number;
  tenant_id: number;
  plan_id: number;
  status: TenantSubscriptionStatus;
  started_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: number;
  canceled_at?: string;
  provider: string;
  provider_customer_id?: string;
  provider_subscription_id?: string;
  metadata_json?: string;
  created_at: string;
  updated_at: string;
}

export interface TenantSubscriptionDetails extends TenantSubscriptionRecord {
  plan_code: string;
  plan_name: string;
  features: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface SubscriptionUpdateInput {
  planCode: string;
  status?: TenantSubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  provider?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  metadata?: Record<string, unknown>;
}

export interface BillingWebhookEvent {
  provider?: string;
  eventType: string;
  data: {
    tenantId?: number;
    metadata?: Record<string, unknown>;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    planCode?: string;
    status?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    entitlements?: Record<string, unknown>;
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const safeParseJsonObject = (value: string | undefined): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export class SubscriptionService {
  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId < 1) {
      return 1;
    }
    return tenantId;
  }

  private toEntitlementStorageValue(value: unknown): string {
    return JSON.stringify(value);
  }

  private fromEntitlementStorageValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private normalizeSubscriptionStatus(value?: string): TenantSubscriptionStatus {
    const normalized = (value || 'active').trim().toLowerCase();
    const statusMap: Record<string, TenantSubscriptionStatus> = {
      trialing: 'trialing',
      trial: 'trialing',
      active: 'active',
      past_due: 'past_due',
      pastdue: 'past_due',
      unpaid: 'past_due',
      suspended: 'suspended',
      paused: 'suspended',
      canceled: 'canceled',
      cancelled: 'canceled',
      terminated: 'canceled'
    };
    return statusMap[normalized] || 'active';
  }

  private resolveTenantIdFromWebhook(event: BillingWebhookEvent): number | null {
    if (event.data.tenantId && Number.isInteger(event.data.tenantId) && event.data.tenantId > 0) {
      return event.data.tenantId;
    }
    const metadataTenantId = event.data.metadata?.tenantId ?? event.data.metadata?.tenant_id;
    if (typeof metadataTenantId === 'number' && Number.isInteger(metadataTenantId) && metadataTenantId > 0) {
      return metadataTenantId;
    }
    if (typeof metadataTenantId === 'string') {
      const parsed = parseInt(metadataTenantId, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  }

  async getAvailablePlans(): Promise<SubscriptionPlanRecord[]> {
    return await databaseService.getMany<SubscriptionPlanRecord>(
      `
        SELECT id, code, name, status, price_cents, currency, billing_interval, trial_days, features_json
        FROM subscription_plans
        ORDER BY price_cents ASC, id ASC
      `
    );
  }

  async getPlanByCode(planCode: string): Promise<SubscriptionPlanRecord | null> {
    if (!planCode || typeof planCode !== 'string') {
      throw new Error('Valid plan code is required');
    }
    return await databaseService.getOne<SubscriptionPlanRecord>(
      `
        SELECT id, code, name, status, price_cents, currency, billing_interval, trial_days, features_json
        FROM subscription_plans
        WHERE code = ?
      `,
      [planCode]
    );
  }

  async getTenantSubscription(tenantId?: number): Promise<TenantSubscriptionDetails | null> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const row = await databaseService.getOne<
      TenantSubscriptionRecord & {
        plan_code: string;
        plan_name: string;
        features_json?: string;
      }
    >(
      `
        SELECT
          ts.id,
          ts.tenant_id,
          ts.plan_id,
          ts.status,
          ts.started_at,
          ts.current_period_start,
          ts.current_period_end,
          ts.cancel_at_period_end,
          ts.canceled_at,
          ts.provider,
          ts.provider_customer_id,
          ts.provider_subscription_id,
          ts.metadata_json,
          ts.created_at,
          ts.updated_at,
          sp.code as plan_code,
          sp.name as plan_name,
          sp.features_json
        FROM tenant_subscriptions ts
        INNER JOIN subscription_plans sp
          ON sp.id = ts.plan_id
        WHERE ts.tenant_id = ?
      `,
      [scopedTenantId]
    );

    if (!row) {
      return null;
    }

    return {
      ...row,
      features: safeParseJsonObject(row.features_json),
      metadata: safeParseJsonObject(row.metadata_json)
    };
  }

  async setTenantSubscription(tenantId: number, input: SubscriptionUpdateInput): Promise<boolean> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const plan = await this.getPlanByCode(input.planCode);
    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const now = new Date().toISOString();
    const status = input.status || 'active';
    const currentPeriodEnd = input.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const cancelAtPeriodEnd = input.cancelAtPeriodEnd ? 1 : 0;
    const provider = input.provider || 'internal';
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    const existing = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM tenant_subscriptions WHERE tenant_id = ?',
      [scopedTenantId]
    );

    if (existing) {
      await databaseService.executeQuery(
        `
          UPDATE tenant_subscriptions
          SET
            plan_id = ?,
            status = ?,
            current_period_end = ?,
            cancel_at_period_end = ?,
            provider = ?,
            provider_customer_id = COALESCE(?, provider_customer_id),
            provider_subscription_id = COALESCE(?, provider_subscription_id),
            metadata_json = COALESCE(?, metadata_json),
            canceled_at = CASE WHEN ? = 1 THEN COALESCE(canceled_at, NOW()) ELSE NULL END,
            updated_at = NOW()
          WHERE tenant_id = ?
        `,
        [
          plan.id,
          status,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          provider,
          input.providerCustomerId || null,
          input.providerSubscriptionId || null,
          metadataJson,
          cancelAtPeriodEnd,
          scopedTenantId
        ]
      );
      if (scopedTenantId !== 1 && (status === 'suspended' || status === 'canceled')) {
        await databaseService.executeQuery(
          "UPDATE tenants SET status = 'suspended', updated_at = NOW() WHERE id = ?",
          [scopedTenantId]
        );
      }
      return true;
    }

    await databaseService.executeQuery(
      `
        INSERT INTO tenant_subscriptions (
          tenant_id,
          plan_id,
          status,
          started_at,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          provider,
          provider_customer_id,
          provider_subscription_id,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        scopedTenantId,
        plan.id,
        status,
        now,
        now,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        provider,
        input.providerCustomerId || null,
        input.providerSubscriptionId || null,
        metadataJson,
        now,
        now
      ]
    );
    if (scopedTenantId !== 1 && (status === 'suspended' || status === 'canceled')) {
      await databaseService.executeQuery(
        "UPDATE tenants SET status = 'suspended', updated_at = NOW() WHERE id = ?",
        [scopedTenantId]
      );
    }
    return true;
  }

  async bootstrapTenantSubscription(tenantId: number): Promise<void> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!await databaseService.tableExists('tenant_subscriptions') || !await databaseService.tableExists('subscription_plans')) {
      return;
    }

    const existing = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM tenant_subscriptions WHERE tenant_id = ?',
      [scopedTenantId]
    );
    if (existing) {
      return;
    }

    const trialPlan = await this.getPlanByCode('trial');
    const fallbackPlan = await this.getPlanByCode('starter');
    const selectedPlan = trialPlan || fallbackPlan;
    if (!selectedPlan) {
      return;
    }

    const now = new Date().toISOString();
    const trialEnds = new Date(Date.now() + Math.max(selectedPlan.trial_days || 0, 0) * 24 * 60 * 60 * 1000).toISOString();
    const status: TenantSubscriptionStatus = selectedPlan.code === 'trial' ? 'trialing' : 'active';

    await databaseService.executeQuery(
      `
        INSERT INTO tenant_subscriptions (
          tenant_id,
          plan_id,
          status,
          started_at,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          provider,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 'internal', ?, ?)
      `,
      [scopedTenantId, selectedPlan.id, status, now, now, trialEnds, now, now]
    );
  }

  async getTenantEntitlements(tenantId: number): Promise<Record<string, unknown>> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const subscription = await this.getTenantSubscription(scopedTenantId);
    const planEntitlements = subscription?.features || {};

    const overrideRows = await databaseService.getMany<{ key: string; value: string }>(
      'SELECT key, value FROM tenant_entitlements WHERE tenant_id = ? ORDER BY key',
      [scopedTenantId]
    );

    const overrides = overrideRows.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.key] = this.fromEntitlementStorageValue(row.value);
      return acc;
    }, {});

    return {
      ...planEntitlements,
      ...overrides
    };
  }

  async updateTenantEntitlements(
    tenantId: number,
    entitlements: Record<string, unknown>,
    updatedByUserId?: number
  ): Promise<boolean> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (!isObject(entitlements) || Object.keys(entitlements).length === 0) {
      throw new Error('At least one entitlement update is required');
    }

    await databaseService.executeTransaction(async () => {
      for (const [key, value] of Object.entries(entitlements)) {
        const serializedValue = this.toEntitlementStorageValue(value);
        const updateResult = await databaseService.executeQuery(
          `
            UPDATE tenant_entitlements
            SET
              value = ?,
              source = 'manual',
              updated_by_user_id = ?,
              updated_at = NOW()
            WHERE tenant_id = ? AND key = ?
          `,
          [serializedValue, updatedByUserId || null, scopedTenantId, key]
        );

        if (updateResult.changes === 0) {
          await databaseService.executeQuery(
            `
              INSERT INTO tenant_entitlements (
                tenant_id,
                key,
                value,
                source,
                updated_by_user_id,
                created_at,
                updated_at
              ) VALUES (?, ?, ?, 'manual', ?, NOW(), NOW())
            `,
            [scopedTenantId, key, serializedValue, updatedByUserId || null]
          );
        }
      }
    });

    return true;
  }

  async assertWithinLimit(tenantId: number, limitKey: string, currentCount: number): Promise<void> {
    const entitlements = await this.getTenantEntitlements(tenantId);
    const limit = entitlements[limitKey];
    if (typeof limit === 'number' && limit > 0 && currentCount >= limit) {
      const error = new Error(`Plan limit reached: ${limitKey} (${currentCount}/${limit})`);
      (error as any).code = 'ENTITLEMENT_LIMIT_EXCEEDED';
      (error as any).limitKey = limitKey;
      (error as any).limit = limit;
      (error as any).current = currentCount;
      throw error;
    }
  }

  async isFeatureEnabled(tenantId: number, entitlementKey: string): Promise<boolean> {
    if (!entitlementKey || typeof entitlementKey !== 'string') {
      return true;
    }
    const entitlements = await this.getTenantEntitlements(tenantId);
    const value = entitlements[entitlementKey];
    if (value === undefined || value === null) {
      // Unknown flags fail-open to avoid accidental lockout.
      return true;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value > 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['false', '0', 'off', 'disabled', 'no'].includes(normalized)) {
        return false;
      }
      return true;
    }
    return true;
  }

  async syncSubscriptionFromWebhook(event: BillingWebhookEvent): Promise<{ tenantId: number }> {
    if (!event?.eventType || !event.data || !isObject(event.data)) {
      throw new Error('Invalid webhook event payload');
    }

    const tenantId = this.resolveTenantIdFromWebhook(event);
    if (!tenantId) {
      throw new Error('Webhook payload missing tenant identifier');
    }

    const normalizedStatus = this.normalizeSubscriptionStatus(event.data.status);
    const planCode = event.data.planCode || (normalizedStatus === 'trialing' ? 'trial' : 'starter');
    const updateInput: SubscriptionUpdateInput = {
      planCode,
      status: normalizedStatus,
      provider: event.provider || 'external'
    };
    if (event.data.currentPeriodEnd !== undefined) {
      updateInput.currentPeriodEnd = event.data.currentPeriodEnd;
    }
    if (event.data.cancelAtPeriodEnd !== undefined) {
      updateInput.cancelAtPeriodEnd = event.data.cancelAtPeriodEnd;
    }
    if (event.data.providerCustomerId !== undefined) {
      updateInput.providerCustomerId = event.data.providerCustomerId;
    }
    if (event.data.providerSubscriptionId !== undefined) {
      updateInput.providerSubscriptionId = event.data.providerSubscriptionId;
    }
    if (event.data.metadata !== undefined) {
      updateInput.metadata = event.data.metadata;
    }

    await this.setTenantSubscription(tenantId, updateInput);

    if (event.data.entitlements && isObject(event.data.entitlements)) {
      await this.updateTenantEntitlements(tenantId, event.data.entitlements);
    }

    if (tenantId !== 1 && (normalizedStatus === 'active' || normalizedStatus === 'trialing')) {
      await databaseService.executeQuery(
        "UPDATE tenants SET status = CASE WHEN status = 'deleted' THEN status ELSE 'active' END, updated_at = NOW() WHERE id = ?",
        [tenantId]
      );
    }

    // Record a payment_failed dunning event when a payment fails
    if (event.eventType === 'invoice.payment_failed') {
      const dunningTableExists = await databaseService.tableExists('dunning_events');
      if (dunningTableExists) {
        await databaseService.executeQuery(
          `INSERT INTO dunning_events (tenant_id, event_type, sent_at) VALUES (?, 'payment_failed', NOW())`,
          [tenantId]
        );
      }
    }

    // Dispatch webhook for subscription update (fire-and-forget)
    outboundWebhookService.dispatch(tenantId, 'subscription.updated', {
      tenant_id: tenantId,
      status: normalizedStatus,
      plan_code: planCode
    }).catch(() => {});

    return { tenantId };
  }

  /**
   * Process dunning workflow for all tenants with past_due subscriptions.
   * Schedule: Day 1, Day 5, Day 14 after first payment failure → suspend
   */
  async processDunning(): Promise<number> {
    const dunningTableExists = await databaseService.tableExists('dunning_events');
    if (!dunningTableExists) {
      return 0;
    }

    // Get all tenants with past_due subscriptions
    const pastDueTenants = await databaseService.getMany<{ tenant_id: number; email: string; name: string }>(
      `
        SELECT ts.tenant_id, u.email, u.name
        FROM tenant_subscriptions ts
        LEFT JOIN users u ON u.tenant_id = ts.tenant_id AND u.role = 'admin'
        WHERE ts.status = 'past_due'
        GROUP BY ts.tenant_id
      `
    );

    let processed = 0;

    for (const tenant of pastDueTenants) {
      const acted = await this.processDunningForTenant(tenant.tenant_id, tenant.email, tenant.name);
      if (acted) {
        processed++;
      }
    }

    return processed;
  }

  private async processDunningForTenant(tenantId: number, email: string, name: string): Promise<boolean> {
    // Get the first payment_failed event to determine when the failure occurred
    const failureEvent = await databaseService.getOne<{ sent_at: string }>(
      `SELECT sent_at FROM dunning_events WHERE tenant_id = ? AND event_type = 'payment_failed' ORDER BY sent_at ASC LIMIT 1`,
      [tenantId]
    );

    if (!failureEvent) {
      return false;
    }

    const failureDate = new Date(failureEvent.sent_at);
    const now = new Date();
    const daysElapsed = Math.floor((now.getTime() - failureDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check which dunning events have already been sent
    const sentEvents = await databaseService.getMany<{ event_type: string }>(
      `SELECT event_type FROM dunning_events WHERE tenant_id = ? AND event_type IN ('reminder_1', 'reminder_2', 'final_notice', 'suspended')`,
      [tenantId]
    );
    const sentTypes = new Set(sentEvents.map(e => e.event_type));

    // If already suspended via dunning, skip
    if (sentTypes.has('suspended')) {
      return false;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:5173';

    // Day 14+: if final_notice already sent → suspend
    if (daysElapsed >= 14 && sentTypes.has('final_notice')) {
      // Lazy import avoids a circular module dependency (TenantService imports SubscriptionService).
      const { tenantService } = await import('./TenantService.js');
      await tenantService.updateTenantStatus(tenantId, 'suspended');
      await databaseService.executeQuery(
        `INSERT INTO dunning_events (tenant_id, event_type, sent_at) VALUES (?, 'suspended', NOW())`,
        [tenantId]
      );
      return true;
    }

    // Day 14+: send final notice (if not yet sent)
    if (daysElapsed >= 14 && !sentTypes.has('final_notice')) {
      const finalContent = await emailTemplateService.render('dunning_final_notice', {
        name: name || 'there',
        portal_url: appUrl
      }, tenantId);
      await emailProviderService.sendEmail({
        to: email,
        subject: finalContent.subject,
        html: finalContent.html,
        text: finalContent.text,
        tenantId
      });
      await databaseService.executeQuery(
        `INSERT INTO dunning_events (tenant_id, event_type, sent_at) VALUES (?, 'final_notice', NOW())`,
        [tenantId]
      );
      return true;
    }

    // Day 5+: send reminder_2 (if not yet sent)
    if (daysElapsed >= 5 && !sentTypes.has('reminder_2')) {
      const reminder2Content = await emailTemplateService.render('dunning_reminder_2', {
        name: name || 'there',
        portal_url: appUrl,
        days_remaining: '9'
      }, tenantId);
      await emailProviderService.sendEmail({
        to: email,
        subject: reminder2Content.subject,
        html: reminder2Content.html,
        text: reminder2Content.text,
        tenantId
      });
      await databaseService.executeQuery(
        `INSERT INTO dunning_events (tenant_id, event_type, sent_at) VALUES (?, 'reminder_2', NOW())`,
        [tenantId]
      );
      return true;
    }

    // Day 1+: send reminder_1 (if not yet sent)
    if (daysElapsed >= 1 && !sentTypes.has('reminder_1')) {
      const reminder1Content = await emailTemplateService.render('dunning_reminder_1', {
        name: name || 'there',
        portal_url: appUrl
      }, tenantId);
      await emailProviderService.sendEmail({
        to: email,
        subject: reminder1Content.subject,
        html: reminder1Content.html,
        text: reminder1Content.text,
        tenantId
      });
      await databaseService.executeQuery(
        `INSERT INTO dunning_events (tenant_id, event_type, sent_at) VALUES (?, 'reminder_1', NOW())`,
        [tenantId]
      );
      return true;
    }

    return false;
  }
}

export const subscriptionService = new SubscriptionService();
