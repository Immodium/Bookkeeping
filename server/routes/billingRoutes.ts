import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { serverConfig, stripeConfig } from '../config/index.js';
import { subscriptionService, BillingWebhookEvent } from '../services/SubscriptionService.js';
import { stripeService } from '../services/StripeService.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';
import { db } from '../database/index.js';

type StripeInstance = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeInstance['webhooks']['constructEvent']>;

// Local shapes for webhook event data objects (differ from API response types)
interface StripeWebhookSubscription {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  metadata: Record<string, string>;
  current_period_end: number | null;
}

interface StripeWebhookInvoice {
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
  metadata?: Record<string, string>;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  const maxLen = Math.max(ba.length, bb.length);
  const paddedA = Buffer.alloc(maxLen);
  const paddedB = Buffer.alloc(maxLen);
  ba.copy(paddedA);
  bb.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB) && ba.length === bb.length;
}

const router: Router = Router();

// GET /api/billing/plans — public, no auth required
router.get('/plans', async (req: Request, res: Response): Promise<void> => {
  try {
    const plans = await subscriptionService.getAvailablePlans();
    const plansWithFeatures = plans
      .filter(plan => plan.status === 'active')
      .map(plan => {
        let features: Record<string, unknown> = {};
        if (plan.features_json) {
          try {
            const parsed = JSON.parse(plan.features_json);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              features = parsed;
            }
          } catch {
            // ignore parse errors
          }
        }
        return { ...plan, features };
      });
    res.json({ success: true, data: plansWithFeatures });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/billing/subscription — requires auth
router.get('/subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const subscription = await subscriptionService.getTenantSubscription(tenantId);
    const entitlements = await subscriptionService.getTenantEntitlements(tenantId);
    res.json({ success: true, data: { subscription, entitlements } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/billing/checkout — requires auth
router.post('/checkout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!stripeService.isConfigured()) {
    res.status(503).json({ error: 'Billing not configured' });
    return;
  }

  const { planCode, successUrl, cancelUrl } = req.body as { planCode?: string; successUrl?: string; cancelUrl?: string };
  if (!planCode || !successUrl || !cancelUrl) {
    res.status(400).json({ error: 'planCode, successUrl, and cancelUrl are required' });
    return;
  }

  try {
    const tenantId = req.user?.tenant_id || 1;
    const email = req.user?.email || '';
    const name = req.user?.name || '';

    const customerId = await stripeService.ensureCustomer(tenantId, email, name);
    const url = await stripeService.createCheckoutSession({ tenantId, customerId, planCode, successUrl, cancelUrl });
    res.json({ url });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// POST /api/billing/portal — requires auth
router.post('/portal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!stripeService.isConfigured()) {
    res.status(503).json({ error: 'Billing not configured' });
    return;
  }

  const { returnUrl } = req.body as { returnUrl?: string };
  if (!returnUrl) {
    res.status(400).json({ error: 'returnUrl is required' });
    return;
  }

  try {
    const tenantId = req.user?.tenant_id || 1;
    const subscription = await subscriptionService.getTenantSubscription(tenantId);
    const customerId = subscription?.provider_customer_id;

    if (!customerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    const url = await stripeService.createPortalSession({ customerId, returnUrl });
    res.json({ url });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// POST /api/billing/dunning/process — requires auth + admin
router.post('/dunning/process', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const processed = await subscriptionService.processDunning();
    res.json({ processed });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/billing/webhook — raw body for Stripe signature verification
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response): Promise<void> => {
    // Handle Stripe webhook verification when configured
    if (stripeService.isConfigured()) {
      // Stripe webhook secret must be present when Stripe is configured
      if (!stripeConfig.webhookSecret) {
        console.error('Stripe is configured but STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook');
        res.status(400).json({ success: false, error: 'Stripe webhook secret not configured' });
        return;
      }

      const sig = req.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        res.status(400).json({ success: false, error: 'Missing Stripe signature' });
        return;
      }

      let stripeEvent;
      try {
        stripeEvent = stripeService.constructWebhookEvent(req.body as Buffer, sig);
      } catch (err) {
        res.status(400).json({ success: false, error: (err as Error).message });
        return;
      }

      // Idempotency check — deduplicate already-processed events
      const eventId = stripeEvent.id;
      if (eventId) {
        try {
          const existing = await db.getOne<{ event_id: string }>(
            'SELECT event_id FROM processed_webhook_events WHERE event_id = ?',
            [eventId]
          );
          if (existing) {
            res.json({ received: true, duplicate: true });
            return;
          }
        } catch {
          // If table not ready yet, continue — idempotency is best-effort
        }
      }

      // Map Stripe event types to BillingWebhookEvent shape
      const mapped = mapStripeEvent(stripeEvent);
      if (mapped) {
        try {
          const result = await subscriptionService.syncSubscriptionFromWebhook(mapped);

          // Record as processed
          if (eventId) {
            db.executeQuery(
              "INSERT INTO processed_webhook_events (event_id, provider) VALUES (?, 'stripe') ON CONFLICT (event_id) DO NOTHING",
              [eventId]
            ).catch(() => {});
          }

          res.json({ success: true, data: result });
        } catch (error) {
          res.status(400).json({ success: false, error: (error as Error).message });
        }
        return;
      }

      // Record as processed even for unhandled event types
      if (eventId) {
        db.executeQuery(
          "INSERT INTO processed_webhook_events (event_id, provider) VALUES (?, 'stripe') ON CONFLICT (event_id) DO NOTHING",
          [eventId]
        ).catch(() => {});
      }

      // Acknowledge unhandled Stripe events
      res.json({ success: true, data: { received: true } });
      return;
    }

    // Fallback: generic webhook with X-BILLING-WEBHOOK-SECRET header
    const configuredSecret = serverConfig.billingWebhookSecret;
    const incomingSecret = req.headers['x-billing-webhook-secret'];
    const normalizedIncoming = Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret;

    if (!configuredSecret) {
      if (serverConfig.saasMode || serverConfig.isProduction) {
        res.status(503).json({
          success: false,
          error: 'Billing webhook secret is not configured'
        });
        return;
      }
    } else if (!normalizedIncoming || !timingSafeEqual(normalizedIncoming, configuredSecret)) {
      res.status(401).json({
        success: false,
        error: 'Invalid billing webhook secret'
      });
      return;
    }

    // Parse body — when express.raw is applied, body is a Buffer; parse it as JSON
    let payload: BillingWebhookEvent;
    try {
      const raw = req.body;
      if (Buffer.isBuffer(raw)) {
        payload = JSON.parse(raw.toString('utf8')) as BillingWebhookEvent;
      } else {
        payload = raw as BillingWebhookEvent;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Invalid JSON body' });
      return;
    }

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Webhook payload is required'
      });
      return;
    }

    try {
      const result = await subscriptionService.syncSubscriptionFromWebhook(payload);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  }
);

/**
 * Map a Stripe event to the BillingWebhookEvent shape used by syncSubscriptionFromWebhook.
 * Returns null for unhandled event types.
 */
function mapStripeEvent(event: StripeEvent): BillingWebhookEvent | null {
  const type = event.type;

  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const sub = event.data.object as unknown as StripeWebhookSubscription;
    const tenantIdStr = sub.metadata?.tenantId;
    const tenantId = tenantIdStr ? parseInt(tenantIdStr, 10) : undefined;
    const status = type === 'customer.subscription.deleted' ? 'canceled' : (sub.status as string);
    const currentPeriodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : undefined;

    const eventType =
      type === 'customer.subscription.created' ? 'subscription.created' :
      type === 'customer.subscription.updated' ? 'subscription.updated' :
      'subscription.deleted';

    const providerCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    return {
      provider: 'stripe',
      eventType,
      data: {
        ...(tenantId !== undefined ? { tenantId } : {}),
        status,
        ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
        ...(providerCustomerId !== undefined ? { providerCustomerId } : {}),
        providerSubscriptionId: sub.id,
        metadata: sub.metadata as Record<string, unknown>
      }
    };
  }

  if (type === 'invoice.paid') {
    const inv = event.data.object as unknown as StripeWebhookInvoice;
    const sub = inv.subscription;
    const tenantId = inv.metadata?.tenantId
      ? parseInt(inv.metadata.tenantId, 10) || undefined
      : undefined;
    const providerCustomerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as { id: string } | null)?.id;
    const providerSubscriptionId = typeof sub === 'string' ? sub : sub?.id ?? undefined;
    return {
      provider: 'stripe',
      eventType: 'invoice.paid',
      data: {
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...(providerCustomerId !== undefined ? { providerCustomerId } : {}),
        ...(providerSubscriptionId !== undefined ? { providerSubscriptionId } : {})
      }
    };
  }

  if (type === 'invoice.payment_failed') {
    const inv = event.data.object as unknown as StripeWebhookInvoice;
    const sub = inv.subscription;
    const tenantId = inv.metadata?.tenantId
      ? parseInt(inv.metadata.tenantId, 10) || undefined
      : undefined;
    const providerCustomerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as { id: string } | null)?.id;
    const providerSubscriptionId = typeof sub === 'string' ? sub : sub?.id ?? undefined;
    return {
      provider: 'stripe',
      eventType: 'invoice.payment_failed',
      data: {
        ...(tenantId !== undefined ? { tenantId } : {}),
        status: 'past_due',
        ...(providerCustomerId !== undefined ? { providerCustomerId } : {}),
        ...(providerSubscriptionId !== undefined ? { providerSubscriptionId } : {})
      }
    };
  }

  return null;
}

export default router;
