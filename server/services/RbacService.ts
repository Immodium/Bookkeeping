import { databaseService } from '../core/DatabaseService.js';
import { AppRole, UserPublic } from '../types/index.js';

const APP_ROLES: AppRole[] = ['admin', 'client_manager', 'project_manager', 'user_manager'];

export interface UserWithRoles extends UserPublic {
  roles: AppRole[];
}

const parseStoredRole = (role: string): AppRole[] => {
  if (!role) return [];
  if (role.includes(',')) {
    return role
      .split(',')
      .map(r => r.trim())
      .filter((r): r is AppRole => APP_ROLES.includes(r as AppRole));
  }
  return APP_ROLES.includes(role as AppRole) ? [role as AppRole] : [];
};

export class RbacService {
  getAppRoles(): AppRole[] {
    return [...APP_ROLES];
  }

  getEffectiveRolesFromUser(user: Pick<UserPublic, 'role' | 'roles'>): AppRole[] {
    const roleSet = new Set<AppRole>();
    parseStoredRole(user.role || '').forEach(role => roleSet.add(role));
    (user.roles || []).forEach(role => {
      if (APP_ROLES.includes(role)) roleSet.add(role);
    });
    return [...roleSet];
  }

  hasAnyRoleInUser(user: Pick<UserPublic, 'role' | 'roles'>, roles: AppRole[]): boolean {
    const effective = this.getEffectiveRolesFromUser(user);
    return roles.some(role => effective.includes(role));
  }

  async userHasAnyRole(userId: number, roles: AppRole[]): Promise<boolean> {
    if (!Number.isInteger(userId) || userId <= 0) {
      return false;
    }

    const placeholders = roles.map(() => '?').join(', ');
    const row = databaseService.getOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_roles WHERE user_id = ? AND role IN (${placeholders})`,
      [userId, ...roles]
    );

    if ((row?.count || 0) > 0) {
      return true;
    }

    const user = databaseService.getOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user?.role) {
      return false;
    }

    const fallbackRoles = parseStoredRole(user.role);
    return roles.some(role => fallbackRoles.includes(role));
  }

  isAdmin(user: Pick<UserPublic, 'role' | 'roles'>): boolean {
    return this.hasAnyRoleInUser(user, ['admin']);
  }

  getUserRoles(userId: number): AppRole[] {
    if (!Number.isInteger(userId) || userId <= 0) {
      return [];
    }

    const rows = databaseService.getMany<{ role: string }>(
      'SELECT role FROM user_roles WHERE user_id = ? ORDER BY role ASC',
      [userId]
    );
    const normalized = rows
      .map(row => row.role)
      .filter((role): role is AppRole => APP_ROLES.includes(role as AppRole));

    if (normalized.length > 0) {
      return normalized;
    }

    const user = databaseService.getOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user) {
      return [];
    }

    const fallbackRoles = parseStoredRole(user.role);
    if (fallbackRoles.length > 0) {
      this.setUserRoles(userId, fallbackRoles);
    }

    return fallbackRoles;
  }

  setUserRoles(userId: number, roles: AppRole[]): AppRole[] {
    const deduped = [...new Set(roles)].filter(role => APP_ROLES.includes(role));
    if (deduped.length === 0) {
      throw new Error('At least one role is required');
    }

    databaseService.executeTransaction(() => {
      databaseService.executeQuery('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      deduped.forEach(role => {
        databaseService.executeQuery(
          'INSERT INTO user_roles (user_id, role, created_at) VALUES (?, ?, datetime(\'now\'))',
          [userId, role]
        );
      });

      // Keep legacy single-role column aligned for existing code paths.
      const primaryRole = deduped.includes('admin') ? 'admin' : deduped[0];
      databaseService.updateById('users', userId, { role: primaryRole });
    });

    return deduped;
  }

  attachRoles<T extends UserPublic>(user: T): UserWithRoles {
    const roles = this.getUserRoles(user.id);
    return { ...user, roles };
  }

  attachRolesToUsers<T extends UserPublic>(users: T[]): UserWithRoles[] {
    if (users.length === 0) return [];
    const ids = users.map(user => user.id);
    const placeholders = ids.map(() => '?').join(', ');
    const rows = databaseService.getMany<{ user_id: number; role: string }>(
      `SELECT user_id, role FROM user_roles WHERE user_id IN (${placeholders})`,
      ids
    );

    const byUserId = new Map<number, AppRole[]>();
    rows.forEach(row => {
      if (!APP_ROLES.includes(row.role as AppRole)) return;
      const arr = byUserId.get(row.user_id) || [];
      arr.push(row.role as AppRole);
      byUserId.set(row.user_id, arr);
    });

    return users.map(user => ({
      ...user,
      roles: byUserId.get(user.id) || []
    }));
  }
}

export const rbacService = new RbacService();
