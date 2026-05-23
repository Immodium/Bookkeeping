import Stripe from 'stripe';
import { stripeConfig } from '../config/index.js';
import { databaseService } from '../core/DatabaseService.js';

export class StripeService {
  private stripe: InstanceType<typeof Stripe> | null = null;

  constructor() {
    if (stripeConfig.isConfigured && stripeConfig.secretKey) {
      this.stripe = new Stripe(stripeConfig.secretKey, {
        apiVersion: '2026-04-22.dahlia'
      });
    }
  }

  isConfigured(): boolean {
    return stripeConfig.isConfigured && this.stripe !== null;
  }

  /**
   * Create or retrieve a Stripe customer for a tenant.
   * Stores provider_customer_id on tenant_subscriptions after creation.
   */
  async ensureCustomer(tenantId: number, email: string, name: string): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    // Check if we already have a customer ID stored
    const subscription = await databaseService.getOne<{ provider_customer_id: string | null }>(
      'SELECT provider_customer_id FROM tenant_subscriptions WHERE tenant_id = ?',
      [tenantId]
    );

    if (subscription?.provider_customer_id) {
      return subscription.provider_customer_id;
    }

    try {
      // Create a new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          tenantId: String(tenantId)
        }
      });

      // Store the customer ID
      await databaseService.executeQuery(
        `UPDATE tenant_subscriptions
         SET provider_customer_id = ?, updated_at = NOW()
         WHERE tenant_id = ?`,
        [customer.id, tenantId]
      );

      return customer.id;
    } catch (error) {
      throw new Error(`Failed to create Stripe customer: ${(error as Error).message}`);
    }
  }

  /**
   * Create a Stripe Checkout Session for upgrading to a paid plan.
   * planCode maps to a Stripe Price ID via STRIPE_PRICE_<PLAN_CODE_UPPERCASE> env vars
   */
  async createCheckoutSession(params: {
    tenantId: number;
    customerId: string;
    planCode: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const priceId = process.env[`STRIPE_PRICE_${params.planCode.toUpperCase()}`];
    if (!priceId) {
      throw new Error(`Stripe price ID not configured for plan: ${params.planCode} (set STRIPE_PRICE_${params.planCode.toUpperCase()})`);
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        subscription_data: {
          metadata: {
            tenantId: String(params.tenantId)
          }
        }
      });

      if (!session.url) {
        throw new Error('Stripe checkout session URL is missing');
      }

      return session.url;
    } catch (error) {
      throw new Error(`Failed to create Stripe checkout session: ${(error as Error).message}`);
    }
  }

  /**
   * Create a Stripe Billing Portal session for the tenant to manage their subscription
   */
  async createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl
      });

      return session.url;
    } catch (error) {
      throw new Error(`Failed to create Stripe portal session: ${(error as Error).message}`);
    }
  }

  /**
   * Verify and parse an incoming Stripe webhook
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const webhookSecret = stripeConfig.webhookSecret;
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret is not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      throw new Error(`Stripe webhook verification failed: ${(error as Error).message}`);
    }
  }
}

export const stripeService = new StripeService();
