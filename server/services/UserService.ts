// User Service - Domain-specific service for user management operations
// Handles user CRUD operations and user profile management

import { databaseService } from '../core/DatabaseService.js';
import { User, UserPublic, ServiceOptions, UserRole } from '../types/index.js';
import { getPrimaryRole, normalizeRoles } from '../auth/roles.js';

/**
 * User Management Service
 * Handles user lifecycle management, profile updates, and administrative operations
 */
export class UserService {
  private reserveNextUserId(): number {
    const counterNextId = databaseService.getNextId('users');
    const maxUserIdRow = databaseService.getOne<{ maxId: number }>(
      'SELECT COALESCE(MAX(id), 0) as maxId FROM users'
    );
    const maxUserId = maxUserIdRow?.maxId || 0;

    if (counterNextId > maxUserId) {
      return counterNextId;
    }

    const reconciledNextId = maxUserId + 1;
    databaseService.executeQuery(
      `
        INSERT INTO counters (name, value)
        VALUES ('users', ?)
        ON CONFLICT(name) DO UPDATE SET value = excluded.value
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
  async getAllUsers(options: ServiceOptions = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    
    const rows = databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Get user by ID
   */
  async getUserById(id: number): Promise<UserPublic | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const user = databaseService.getOne<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE id = ?
    `, [id]);

    return user ? this.mapUserPublic(user) : null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email is required');
    }

    const user = databaseService.getOne<User>('SELECT * FROM users WHERE email = ?', [email]);
    return this.mapUserWithRoles(user);
  }

  /**
   * Get user by Google ID
   */
  async getUserByGoogleId(googleId: string): Promise<User | null> {
    if (!googleId || typeof googleId !== 'string') {
      throw new Error('Valid Google ID is required');
    }

    const user = databaseService.getOne<User>(
      'SELECT * FROM users WHERE google_id = ?', 
      [decodeURIComponent(googleId)]
    );
    return this.mapUserWithRoles(user);
  }

  /**
   * Create new user
   */
  async createUser(userData: {
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

    // Check if user already exists
    if (databaseService.exists('users', 'email', email)) {
      throw new Error('User with this email already exists');
    }

    const normalizedRoles = normalizeRoles(roles && roles.length > 0 ? roles : [role]);
    const primaryRole = getPrimaryRole(normalizedRoles, role);

    // Keep user ID generation resilient if counters drift behind real IDs.
    const nextId = this.reserveNextUserId();
    
    // Create user
    const now = new Date().toISOString();
    try {
      databaseService.executeQuery(`
        INSERT INTO users (
          id, name, email, username, password_hash, role, roles, email_verified,
          google_id, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        nextId, 
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

      const fallbackId = this.reserveNextUserId();
      databaseService.executeQuery(`
        INSERT INTO users (
          id, name, email, username, password_hash, role, roles, email_verified,
          google_id, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fallbackId,
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
  }>): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    if (!userData || typeof userData !== 'object') {
      throw new Error('User data is required');
    }

    // Check if user exists
    const existingUser = await this.getUserById(id);
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
        const emailExists = databaseService.getOne<{id: number}>(
          'SELECT id FROM users WHERE email = ? AND id != ?', 
          [updateData.email, id]
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

    const success = databaseService.updateById('users', id, updateData);
    return success ? 1 : 0;
  }

  /**
   * Delete user
   */
  async deleteUser(id: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    // Check if user exists
    const existingUser = await this.getUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Don't allow deletion of the last admin
    const adminCount = databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin' OR roles LIKE '%\"admin\"%'"
    );
    
    const existingRoles = normalizeRoles(existingUser.roles);
    if (existingRoles.includes('admin') && (adminCount?.count || 0) <= 1) {
      throw new Error('Cannot delete the last administrator');
    }

    const success = databaseService.deleteById('users', id);
    return success ? 1 : 0;
  }

  /**
   * Update user login attempts
   */
  async updateUserLoginAttempts(
    userId: number, 
    attempts: number, 
    lockedUntil: string | null = null
  ): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }
    
    if (typeof attempts !== 'number' || attempts < 0) {
      throw new Error('Valid attempts count is required');
    }

    const changes = databaseService.executeQuery(
      "UPDATE users SET failed_login_attempts = ?, account_locked_until = ?, updated_at = datetime('now') WHERE id = ?",
      [attempts, lockedUntil, userId]
    );

    return changes.changes > 0;
  }

  /**
   * Update user last login
   */
  async updateUserLastLogin(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const changes = databaseService.executeQuery(
      "UPDATE users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [userId]
    );

    return changes.changes > 0;
  }

  /**
   * Verify user email
   */
  async verifyUserEmail(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const changes = databaseService.executeQuery(
      "UPDATE users SET email_verified = 1, email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [userId]
    );

    return changes.changes > 0;
  }

  /**
   * Check if user exists by ID
   */
  async userExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('users', 'id', id);
  }

  /**
   * Check if email is already in use
   */
  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    if (!email || typeof email !== 'string') {
      return false;
    }

    if (excludeId) {
      const user = databaseService.getOne<{id: number}>(
        'SELECT id FROM users WHERE email = ? AND id != ?', 
        [email, excludeId]
      );
      return !!user;
    }
    
    return databaseService.exists('users', 'email', email);
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role: UserRole, options: ServiceOptions = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;

    const rows = databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE role = ? OR roles LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [role, `%"${role}"%`, limit, offset]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Get locked users
   */
  async getLockedUsers(options: ServiceOptions = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;

    const rows = databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE account_locked_until IS NOT NULL AND account_locked_until > datetime('now')
      ORDER BY account_locked_until DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Unlock user account
   */
  async unlockUser(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const changes = databaseService.executeQuery(
      "UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
      [userId]
    );

    return changes.changes > 0;
  }

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string, options: ServiceOptions = {}): Promise<UserPublic[]> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${searchTerm}%`;

    const rows = databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             roles, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE (name LIKE ? OR email LIKE ? OR username LIKE ?)
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
      searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm, searchTerm,
      limit, offset
    ]);

    return rows.map((row) => this.mapUserPublic(row));
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    total: number;
    admins: number;
    regular: number;
    verified: number;
    locked: number;
    recentLogins: number;
  }> {
    const total = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM users'
    )?.count || 0;

    const admins = databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin' OR roles LIKE '%\"admin\"%'"
    )?.count || 0;

    const regular = databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'user'"
    )?.count || 0;

    const verified = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM users WHERE email_verified = 1'
    )?.count || 0;

    const locked = databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE account_locked_until IS NOT NULL AND account_locked_until > datetime('now')"
    )?.count || 0;

    const recentLogins = databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE last_login > datetime('now', '-7 days')"
    )?.count || 0;

    return {
      total,
      admins,
      regular,
      verified,
      locked,
      recentLogins
    };
  }

  async setUserRoles(userId: number, roles: UserRole[]): Promise<void> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    const normalizedRoles = normalizeRoles(roles);
    const primaryRole = getPrimaryRole(normalizedRoles, existingUser.role);

    databaseService.updateById('users', userId, {
      role: primaryRole,
      roles: JSON.stringify(normalizedRoles)
    });
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