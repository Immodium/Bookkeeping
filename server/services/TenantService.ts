import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import { authConfig } from '../config/index.js';
import { databaseService } from '../core/DatabaseService.js';
import { provisionTenantSchema, dropTenantSchema } from '../database/schemas/tenantSchema.js';
import { Tenant, UserRole } from '../types/index.js';
import { subscriptionService } from './SubscriptionService.js';

export interface TenantAdminBootstrapInput {
  name: string;
  email: string;
  password: string;
}

export interface CreateTenantInput {
  name: string;
  slug?: string;
  admin: TenantAdminBootstrapInput;
}

export class TenantService {
  private readonly provisioningCounters = [
    'clients',
    'invoices',
    'expenses',
    'templates',
    'reports',
    'payments'
  ];

  private normalizeTenantId(tenantId: number): number {
    if (!Number.isInteger(tenantId) || tenantId < 1) {
      throw new Error('Valid tenant ID is required');
    }
    return tenantId;
  }

  private toSlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  private assertTenantMutationAllowed(tenantId: number, status: Tenant['status']): void {
    if (tenantId === 1 && status !== 'active') {
      throw new Error('Default platform tenant cannot be suspended or deleted');
    }
  }

  async getAllTenants(): Promise<Array<Tenant & { user_count: number }>> {
    return await databaseService.getMany<Tenant & { user_count: number }>(
      `
        SELECT
          t.id,
          t.public_id,
          t.name,
          t.slug,
          t.status,
          t.created_at,
          t.updated_at,
          (
            SELECT COUNT(*)
            FROM users u
            WHERE u.tenant_id = t.id
          ) as user_count
        FROM tenants t
        ORDER BY t.id ASC
      `
    );
  }

  async getTenantById(tenantId: number): Promise<Tenant | null> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    return await databaseService.getOne<Tenant>(
      'SELECT id, public_id, name, slug, status, created_at, updated_at FROM tenants WHERE id = ?',
      [scopedTenantId]
    );
  }

  async getTenantByPublicId(publicId: string): Promise<Tenant | null> {
    return await databaseService.getOne<Tenant>(
      'SELECT id, public_id, name, slug, status, created_at, updated_at FROM tenants WHERE public_id = ?',
      [publicId]
    );
  }

  async isTenantActive(tenantId: number): Promise<boolean> {
    const tenant = await this.getTenantById(tenantId);
    return tenant?.status === 'active';
  }

  private validateTenantInput(input: CreateTenantInput): { name: string; slug: string } {
    if (!input?.name || typeof input.name !== 'string') {
      throw new Error('Tenant name is required');
    }

    const name = input.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new Error('Tenant name must be between 2 and 120 characters');
    }

    const derivedSlug = this.toSlug(input.slug || name);
    if (!derivedSlug || derivedSlug.length < 2) {
      throw new Error('Tenant slug is invalid');
    }

    return { name, slug: derivedSlug };
  }

  private validateAdminBootstrapInput(input: TenantAdminBootstrapInput): TenantAdminBootstrapInput {
    if (!input || typeof input !== 'object') {
      throw new Error('Tenant admin bootstrap payload is required');
    }

    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password;

    if (!name || name.length < 2 || name.length > 100) {
      throw new Error('Tenant admin name must be between 2 and 100 characters');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Valid tenant admin email is required');
    }
    if (!password || password.length < 8 || password.length > 128) {
      throw new Error('Tenant admin password must be between 8 and 128 characters');
    }

    return { name, email, password };
  }

  private getScopedCounterName(counterName: string, tenantId: number): string {
    return tenantId === 1 ? counterName : `${counterName}__tenant_${tenantId}`;
  }

  private async initializeTenantCounters(tenantId: number): Promise<void> {
    for (const counterName of this.provisioningCounters) {
      await databaseService.executeQuery(
        `
          INSERT INTO counters (tenant_id, name, value, created_at, updated_at)
          VALUES (?, ?, 0, NOW(), NOW())
        `,
        [tenantId, this.getScopedCounterName(counterName, tenantId)]
      );
    }

    await databaseService.executeQuery(
      `
        INSERT INTO counters (tenant_id, name, value, created_at, updated_at)
        VALUES (?, ?, 0, NOW(), NOW())
      `,
      [tenantId, tenantId === 1 ? 'invoice_counter' : `invoice_counter__tenant_${tenantId}`]
    );
  }

  private async createTenantAdminUser(tenantId: number, admin: TenantAdminBootstrapInput): Promise<number> {
    const nextUserId = await databaseService.getNextId('users');
    const roles: UserRole[] = ['admin'];
    const now = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(admin.password, authConfig.bcryptRounds);

    const result = await databaseService.executeQuery(
      `
        INSERT INTO users (
          id, tenant_id, name, email, username, password_hash, role, roles, email_verified,
          failed_login_attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `,
      [
        nextUserId,
        tenantId,
        admin.name,
        admin.email,
        admin.email,
        passwordHash,
        'admin',
        JSON.stringify(roles),
        1,
        now,
        now
      ]
    );

    if (result.changes < 1) {
      throw new Error('Failed to create tenant admin user');
    }

    return nextUserId;
  }

  async createTenant(
    input: CreateTenantInput
  ): Promise<{ tenantId: number; tenantPublicId: string; adminUserId: number; slug: string }> {
    const { name, slug } = this.validateTenantInput(input);
    const admin = this.validateAdminBootstrapInput(input.admin);
    const tenantPublicId = uuidv7();

    const existingTenant = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM tenants WHERE LOWER(slug) = LOWER(?)',
      [slug]
    );
    if (existingTenant) {
      throw new Error('Tenant slug already exists');
    }

    const existingUser = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [admin.email]
    );
    if (existingUser) {
      throw new Error('Tenant admin email is already in use');
    }

    let tenantId = 0;
    let adminUserId = 0;
    const now = new Date().toISOString();

    await databaseService.executeTransaction(async () => {
      const tenantInsert = await databaseService.executeQuery(
        `
          INSERT INTO tenants (public_id, name, slug, status, created_at, updated_at)
          VALUES (?, ?, ?, 'active', ?, ?)
        `,
        [tenantPublicId, name, slug, now, now]
      );
      tenantId = tenantInsert.lastInsertRowid;
      adminUserId = await this.createTenantAdminUser(tenantId, admin);
      await this.initializeTenantCounters(tenantId);
    });

    // Provision the per-tenant PostgreSQL schema
    await provisionTenantSchema(databaseService, tenantId);

    // Seed tenant onto a default subscription lifecycle if billing tables exist.
    await subscriptionService.bootstrapTenantSubscription(tenantId);

    return { tenantId, tenantPublicId, adminUserId, slug };
  }

  /**
   * Drop the PostgreSQL schema for a tenant.
   * This is a destructive operation — all tenant data will be lost.
   */
  async deleteTenantSchema(tenantId: number): Promise<void> {
    await dropTenantSchema(databaseService, tenantId);
  }

  async bootstrapTenantAdmin(tenantId: number, admin: TenantAdminBootstrapInput): Promise<{ adminUserId: number }> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const normalizedAdmin = this.validateAdminBootstrapInput(admin);
    const tenant = await this.getTenantById(scopedTenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    if (tenant.status !== 'active') {
      throw new Error('Cannot bootstrap admin for non-active tenant');
    }

    const existingUser = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [normalizedAdmin.email]
    );
    if (existingUser) {
      throw new Error('Tenant admin email is already in use');
    }

    const adminUserId = await this.createTenantAdminUser(scopedTenantId, normalizedAdmin);
    return { adminUserId };
  }

  async updateTenantStatus(tenantId: number, status: Tenant['status']): Promise<boolean> {
    if (!['active', 'suspended', 'deleted'].includes(status)) {
      throw new Error('Invalid tenant status');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    this.assertTenantMutationAllowed(scopedTenantId, status);

    const result = await databaseService.executeQuery(
      "UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?",
      [status, scopedTenantId]
    );
    if (result.changes === 0) {
      throw new Error('Tenant not found');
    }
    return true;
  }

  async suspendTenant(tenantId: number): Promise<boolean> {
    return this.updateTenantStatus(tenantId, 'suspended');
  }

  async activateTenant(tenantId: number): Promise<boolean> {
    return this.updateTenantStatus(tenantId, 'active');
  }

  async deleteTenant(tenantId: number): Promise<boolean> {
    return this.updateTenantStatus(tenantId, 'deleted');
  }
}

export const tenantService = new TenantService();
