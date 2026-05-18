// Outbound Webhook Service for Slimbooks
// Manages webhook endpoint registration and event dispatch

import crypto from 'crypto';
import { databaseService } from '../core/DatabaseService.js';

export interface WebhookEndpointRecord {
  id: number;
  tenant_id: number;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  description?: string;
  last_triggered_at?: string;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

interface WebhookEndpointRow {
  id: number;
  tenant_id: number;
  url: string;
  secret: string;
  events: string;
  is_active: number;
  description: string | null;
  last_triggered_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

function parseEvents(eventsJson: string): string[] {
  try {
    const parsed = JSON.parse(eventsJson);
    return Array.isArray(parsed) ? parsed : ['*'];
  } catch {
    return ['*'];
  }
}

function rowToRecord(row: WebhookEndpointRow): WebhookEndpointRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    url: row.url,
    secret: row.secret,
    events: parseEvents(row.events),
    is_active: row.is_active === 1,
    description: row.description ?? undefined,
    last_triggered_at: row.last_triggered_at ?? undefined,
    failure_count: row.failure_count,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

class OutboundWebhookService {
  /**
   * Creates an endpoint with a random HMAC secret.
   * Returns the endpoint record including the plaintext secret (shown once).
   */
  async registerEndpoint(
    tenantId: number,
    url: string,
    events: string[],
    description?: string
  ): Promise<WebhookEndpointRecord & { plainSecret: string }> {
    const plainSecret = crypto.randomBytes(32).toString('hex');
    const eventsJson = JSON.stringify(events && events.length > 0 ? events : ['*']);
    const now = new Date().toISOString();

    await databaseService.executeQuery(
      `INSERT INTO webhook_endpoints (tenant_id, url, secret, events, is_active, description, failure_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?)`,
      [tenantId, url, plainSecret, eventsJson, description || null, now, now]
    );

    const row = await databaseService.getOne<WebhookEndpointRow>(
      'SELECT * FROM webhook_endpoints WHERE tenant_id = ? AND url = ? AND secret = ?',
      [tenantId, url, plainSecret]
    );

    if (!row) {
      throw new Error('Failed to retrieve created webhook endpoint');
    }

    return { ...rowToRecord(row), plainSecret };
  }

  /**
   * List active endpoints for a tenant (secret hidden).
   */
  async listEndpoints(tenantId: number): Promise<Omit<WebhookEndpointRecord, 'secret'>[]> {
    const rows = await databaseService.getMany<WebhookEndpointRow>(
      'SELECT * FROM webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );
    return rows.map(row => {
      const { secret: _secret, ...rest } = rowToRecord(row);
      return rest;
    });
  }

  /**
   * Delete an endpoint.
   */
  async deleteEndpoint(id: number, tenantId: number): Promise<boolean> {
    const result = await databaseService.executeQuery(
      'DELETE FROM webhook_endpoints WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    return result.changes > 0;
  }

  /**
   * Update endpoint fields.
   */
  async updateEndpoint(
    id: number,
    tenantId: number,
    updates: { url?: string; events?: string[]; is_active?: boolean; description?: string }
  ): Promise<boolean> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url);
    }
    if (updates.events !== undefined) {
      fields.push('events = ?');
      values.push(JSON.stringify(updates.events));
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    if (fields.length === 0) {
      return false;
    }

    fields.push("updated_at = datetime('now')");
    values.push(id, tenantId);

    const result = await databaseService.executeQuery(
      `UPDATE webhook_endpoints SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
      values
    );
    return result.changes > 0;
  }

  /**
   * Dispatch an event to all active, matching endpoints for a tenant.
   * Fire-and-forget — never throws.
   */
  async dispatch(tenantId: number, eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const rows = await databaseService.getMany<WebhookEndpointRow>(
        'SELECT * FROM webhook_endpoints WHERE tenant_id = ? AND is_active = 1',
        [tenantId]
      );

      for (const row of rows) {
        const events = parseEvents(row.events);
        const matches = events.includes('*') || events.includes(eventType);
        if (!matches) {
          continue;
        }

        // Fire-and-forget per endpoint
        this.deliverToEndpoint(row, eventType, payload).catch(() => {});
      }
    } catch {
      // Never throw from dispatch
    }
  }

  private async deliverToEndpoint(
    row: WebhookEndpointRow,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadJson = JSON.stringify({ event: eventType, timestamp, data: payload });
    const signature = 'sha256=' + crypto
      .createHmac('sha256', row.secret)
      .update(payloadJson)
      .digest('hex');

    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let deliveredAt: string | null = null;
    let failedAt: string | null = null;

    try {
      const response = await fetch(row.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
          'X-Webhook-Timestamp': String(timestamp)
        },
        body: payloadJson,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      responseStatus = response.status;
      responseBody = await response.text().catch(() => '');

      if (response.ok) {
        deliveredAt = new Date().toISOString();
        // Reset failure_count on success and update last_triggered_at
        await databaseService.executeQuery(
          "UPDATE webhook_endpoints SET failure_count = 0, last_triggered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
          [row.id]
        ).catch(() => {});
      } else {
        failedAt = new Date().toISOString();
        await this.handleDeliveryFailure(row.id);
      }
    } catch (_err) {
      failedAt = new Date().toISOString();
      await this.handleDeliveryFailure(row.id);
    }

    // Log delivery
    await databaseService.executeQuery(
      `INSERT INTO webhook_deliveries (endpoint_id, tenant_id, event_type, payload_json, response_status, response_body, attempt_count, delivered_at, failed_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [row.id, row.tenant_id, eventType, payloadJson, responseStatus, responseBody, deliveredAt, failedAt]
    ).catch(() => {});
  }

  private async handleDeliveryFailure(endpointId: number): Promise<void> {
    try {
      await databaseService.executeQuery(
        "UPDATE webhook_endpoints SET failure_count = failure_count + 1, updated_at = datetime('now') WHERE id = ?",
        [endpointId]
      );
      // Disable if failure_count >= 10
      await databaseService.executeQuery(
        'UPDATE webhook_endpoints SET is_active = 0 WHERE id = ? AND failure_count >= 10',
        [endpointId]
      );
    } catch {
      // ignore
    }
  }

  /**
   * Get recent deliveries for an endpoint.
   */
  async getDeliveries(endpointId: number, tenantId: number, limit: number = 50): Promise<unknown[]> {
    // Verify endpoint belongs to tenant
    const endpoint = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ?',
      [endpointId, tenantId]
    );
    if (!endpoint) {
      return [];
    }

    return await databaseService.getMany(
      'SELECT * FROM webhook_deliveries WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ?',
      [endpointId, limit]
    );
  }
}

export const outboundWebhookService = new OutboundWebhookService();
