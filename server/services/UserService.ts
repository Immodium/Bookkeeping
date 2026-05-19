// User Service - Domain-specific service for user management operations
// Handles user CRUD operations and user profile management

import { databaseService } from '../core/DatabaseService.js';
import { subscriptionService } from './SubscriptionService.js';
import { User, UserPublic, ServiceOptions, UserRole } from '../types/index.js';
import { getPrimaryRole, normalizeRoles } from '../auth/roles.js';

/**
 * User Management Service
 * Handles user lifecycle management, profile updates, and administrative operations
 */
export class UserService {
  private normalizeTenantId(tenantId?: number): number {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`Invalid tenant context: tenantId must be a positive integer, got ${tenantId}`);
    }
    return tenantId;
  }

  private async reserveNextUserId(): Promise<number> {
    const counterNextId = await databaseService.getNextId('users');
    const maxUserIdRow = await databaseService.getOne<{ maxId: number }>(
      'SELECT COALESCE(MAX(id), 0) as maxId FROM users'
    );
    const maxUserId = maxUserIdRow?.maxId || 0;

    if (counterNextId > maxUserId) {
      return counterNextId;
    }

    const reconciledNextId = maxUserId + 1;
    await databaseService.executeQuery(
      `
        INSERT INTO counters (tenant_id, name, value, created_at, updated_at)
        VALUES (1, 'users', ?, datetime('now'), datetime('now'))
        ON CONFLICT(tenant_id, name) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `,
      [reconciledNextId]
    );
    return reconciledNextId;
  }

  private mapUserPublic(row: UserPublic): UserPublic {
    const roles = normalizeRoles(row.roles);
    return {
      ...row,
      role: getPrimaryRole(roles, row.role),
      roles
    };
  }

  private mapUserWithRoles(row: User | null): User | null {
    if (!row) {
      return null;
    }

    const roles = normalizeRoles(row.roles);
    return {
      ...row,
      role: getPrimaryRole(roles, row.role),
      roles
    };
  }

  /**
   * Get all users with pagination
   */
  async getAllUsers(options: ServiceOptions = {}, tenantId?: number): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    
    const rows = await databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, limit, offset]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Get user by ID
   */
  async getUserById(id: number, tenantId?: number): Promise<UserPublic | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const user = await databaseService.getOne<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE id = ? AND tenant_id = ?
    `, [id, scopedTenantId]);

    return user ? this.mapUserPublic(user) : null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string, tenantId?: number): Promise<User | null> {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email is required');
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const user = await databaseService.getOne<User>('SELECT * FROM users WHERE email = ? AND tenant_id = ?', [email, scopedTenantId]);
    return this.mapUserWithRoles(user);
  }

  /**
   * Get user by Google ID
   */
  async getUserByGoogleId(googleId: string, tenantId?: number): Promise<User | null> {
    if (!googleId || typeof googleId !== 'string') {
      throw new Error('Valid Google ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const user = await databaseService.getOne<User>(
      'SELECT * FROM users WHERE google_id = ? AND tenant_id = ?', 
      [decodeURIComponent(googleId), scopedTenantId]
    );
    return this.mapUserWithRoles(user);
  }

  /**
   * Create new user
   */
  async createUser(userData: {
    tenant_id?: number;
    name: string;
    email: string;
    username?: string;
    password_hash?: string;
    role?: UserRole;
    roles?: UserRole[];
    email_verified?: boolean;
    google_id?: string;
    last_login?: string;
    failed_login_attempts?: number;
    account_locked_until?: string;
  }): Promise<number> {
    const { 
      tenant_id,
      name, 
      email, 
      username, 
      password_hash, 
      role = 'user',
      roles,
      email_verified = false, 
      google_id, 
      last_login, 
      failed_login_attempts = 0, 
      account_locked_until 
    } = userData;
    
    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Valid name is required');
    }
    
    if (!email || typeof email !== 'string' || !this.isValidEmail(email)) {
      throw new Error('Valid email is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenant_id);

    // Enforce plan limits
    const userCount = (await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?', [scopedTenantId]
    ))?.count || 0;
    await subscriptionService.assertWithinLimit(scopedTenantId, 'billing.max_users', userCount);

    // Check if user already exists for tenant
    const existingUser = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [scopedTenantId, email]
    );
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const normalizedRoles = normalizeRoles(roles && roles.length > 0 ? roles : [role]);
    const primaryRole = getPrimaryRole(normalizedRoles, role);

    // Keep user ID generation resilient if counters drift behind real IDs.
    const nextId = await this.reserveNextUserId();
    
    // Create user
    const now = new Date().toISOString();
    try {
      await databaseService.executeQuery(`
        INSERT INTO users (
          id, tenant_id, name, email, username, password_hash, role, roles, email_verified,
          google_id, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        nextId, 
        scopedTenantId,
        name, 
        email, 
        username || email, 
        password_hash || null, 
        primaryRole,
        JSON.stringify(normalizedRoles),
        email_verified ? 1 : 0,
        google_id || null,
        last_login || null,
        failed_login_attempts,
        account_locked_until || null,
        now, 
        now
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('UNIQUE constraint failed: users.id')) {
        throw error;
      }

      const fallbackId = await this.reserveNextUserId();
      await databaseService.executeQuery(`
        INSERT INTO users (
          id, tenant_id, name, email, username, password_hash, role, roles, email_verified,
          google_id, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fallbackId,
        scopedTenantId,
        name,
        email,
        username || email,
        password_hash || null,
        primaryRole,
        JSON.stringify(normalizedRoles),
        email_verified ? 1 : 0,
        google_id || null,
        last_login || null,
        failed_login_attempts,
        account_locked_until || null,
        now,
        now
      ]);
      return fallbackId;
    }

    return nextId;
  }

  /**
   * Update user
   */
  async updateUser(id: number, userData: Partial<{
    name: string;
    email: string;
    username: string;
    role: UserRole;
    roles: UserRole[];
    email_verified: boolean;
    google_id: string;
    password_hash: string;
  }>, tenantId?: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    if (!userData || typeof userData !== 'object') {
      throw new Error('User data is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if user exists
    const existingUser = await this.getUserById(id, scopedTenantId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Filter allowed fields and build update data
    const allowedFields = ['name', 'email', 'username', 'role', 'roles', 'email_verified', 'google_id', 'password_hash'];
    const updateData: Record<string, any> = {};
    
    allowedFields.forEach(field => {
      if (userData[field as keyof typeof userData] !== undefined) {
        updateData[field] = userData[field as keyof typeof userData];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Validate email if being updated
    if (updateData.email) {
      if (!this.isValidEmail(updateData.email)) {
        throw new Error('Invalid email format');
      }

      // Check email uniqueness if email is being changed
      if (updateData.email !== existingUser.email) {
        const emailExists = await databaseService.getOne<{id: number}>(
          'SELECT id FROM users WHERE tenant_id = ? AND email = ? AND id != ?', 
          [scopedTenantId, updateData.email, id]
        );
        if (emailExists) {
          throw new Error('Email is already in use');
        }
      }
    }

    if (updateData.roles) {
      const normalizedRoles = normalizeRoles(updateData.roles as UserRole[]);
      updateData.roles = JSON.stringify(normalizedRoles);
      updateData.role = getPrimaryRole(normalizedRoles, updateData.role || existingUser.role);
    } else if (updateData.role) {
      const normalizedRoles = normalizeRoles([updateData.role as UserRole]);
      updateData.roles = JSON.stringify(normalizedRoles);
      updateData.role = getPrimaryRole(normalizedRoles, updateData.role);
    }

    // Convert boolean to SQLite format
    if (updateData.email_verified !== undefined) {
      updateData.email_verified = updateData.email_verified ? 1 : 0;
    }

    const keys = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const result = await databaseService.executeQuery(
      `UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      [...values, id, scopedTenantId]
    );
    return result.changes;
  }

  /**
   * Delete user
   */
  async deleteUser(id: number, tenantId?: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    // Check if user exists
    const existingUser = await this.getUserById(id, scopedTenantId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Don't allow deletion of the last admin
    const adminCount = await databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND (role = 'admin' OR roles LIKE '%\"admin\"%')",
      [scopedTenantId]
    );
    
    const existingRoles = normalizeRoles(existingUser.roles);
    if (existingRoles.includes('admin') && (adminCount?.count || 0) <= 1) {
      throw new Error('Cannot delete the last administrator');
    }

    const result = await databaseService.executeQuery(
      'DELETE FROM users WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
    return result.changes;
  }

  /**
   * Update user login attempts
   */
  async updateUserLoginAttempts(
    userId: number, 
    attempts: number, 
    lockedUntil: string | null = null,
    tenantId?: number
  ): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }
    
    if (typeof attempts !== 'number' || attempts < 0) {
      throw new Error('Valid attempts count is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const changes = await databaseService.executeQuery(
      "UPDATE users SET failed_login_attempts = ?, account_locked_until = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
      [attempts, lockedUntil, userId, scopedTenantId]
    );

    return changes.changes > 0;
  }

  /**
   * Update user last login
   */
  async updateUserLastLogin(userId: number, tenantId?: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const changes = await databaseService.executeQuery(
      "UPDATE users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
      [userId, scopedTenantId]
    );

    return changes.changes > 0;
  }

  /**
   * Verify user email
   */
  async verifyUserEmail(userId: number, tenantId?: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const changes = await databaseService.executeQuery(
      "UPDATE users SET email_verified = 1, email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
      [userId, scopedTenantId]
    );

    return changes.changes > 0;
  }

  /**
   * Check if user exists by ID
   */
  async userExists(id: number, tenantId?: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const user = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
      [id, scopedTenantId]
    );
    return Boolean(user);
  }

  /**
   * Check if email is already in use
   */
  async emailExists(email: string, excludeId?: number, tenantId?: number): Promise<boolean> {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    if (excludeId) {
      const user = await databaseService.getOne<{id: number}>(
        'SELECT id FROM users WHERE tenant_id = ? AND email = ? AND id != ?', 
        [scopedTenantId, email, excludeId]
      );
      return !!user;
    }
    
    const user = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [scopedTenantId, email]
    );
    return Boolean(user);
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role: UserRole, options: ServiceOptions = {}, tenantId?: number): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const rows = await databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE tenant_id = ? AND (role = ? OR roles LIKE ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, role, `%"${role}"%`, limit, offset]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Get locked users
   */
  async getLockedUsers(options: ServiceOptions = {}, tenantId?: number): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);

    const rows = await databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE tenant_id = ? AND account_locked_until IS NOT NULL AND account_locked_until > datetime('now')
      ORDER BY account_locked_until DESC
      LIMIT ? OFFSET ?
    `, [scopedTenantId, limit, offset]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Unlock user account
   */
  async unlockUser(userId: number, tenantId?: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const changes = await databaseService.executeQuery(
      "UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
      [userId, scopedTenantId]
    );

    return changes.changes > 0;
  }

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string, options: ServiceOptions = {}, tenantId?: number): Promise<UserPublic[]> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    const { limit = 50, offset = 0 } = options;
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const searchPattern = `%${searchTerm}%`;

    const rows = await databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE tenant_id = ? AND (name LIKE ? OR email LIKE ? OR username LIKE ?)
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN email = ? THEN 2
          WHEN username = ? THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT ? OFFSET ?
    `, [
      scopedTenantId, searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm, searchTerm,
      limit, offset
    ]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Get user statistics
   */
  async getUserStats(tenantId?: number): Promise<{
    total: number;
    admins: number;
    regular: number;
    verified: number;
    locked: number;
    recentLogins: number;
  }> {
    const scopedTenantId = this.normalizeTenantId(tenantId);
    const total = (await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?',
      [scopedTenantId]
    ))?.count || 0;

    const admins = (await databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND (role = 'admin' OR roles LIKE '%\"admin\"%')",
      [scopedTenantId]
    ))?.count || 0;

    const regular = (await databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND role = 'user'",
      [scopedTenantId]
    ))?.count || 0;

    const verified = (await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND email_verified = 1',
      [scopedTenantId]
    ))?.count || 0;

    const locked = (await databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND account_locked_until IS NOT NULL AND account_locked_until > datetime('now')",
      [scopedTenantId]
    ))?.count || 0;

    const recentLogins = (await databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND last_login > datetime('now', '-7 days')",
      [scopedTenantId]
    ))?.count || 0;

    return {
      total,
      admins,
      regular,
      verified,
      locked,
      recentLogins
    };
  }

  async setUserRoles(userId: number, roles: UserRole[], tenantId?: number): Promise<void> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const scopedTenantId = this.normalizeTenantId(tenantId);
    const existingUser = await this.getUserById(userId, scopedTenantId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    const normalizedRoles = normalizeRoles(roles);
    const primaryRole = getPrimaryRole(normalizedRoles, existingUser.role);

    await databaseService.executeQuery(
      "UPDATE users SET role = ?, roles = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
      [primaryRole, JSON.stringify(normalizedRoles), userId, scopedTenantId]
    );
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Export singleton instance
export const userService = new UserService();