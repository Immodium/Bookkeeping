import { User } from '@/types';

export const APP_ROLES = [
  'admin',
  'client_manager',
  'project_manager',
  'user_manager',
  'user',
  'viewer'
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AppPermission =
  | 'users.read'
  | 'users.write'
  | 'users.reset_password'
  | 'clients.read'
  | 'clients.write'
  | 'reports.read'
  | 'projects.read'
  | 'projects.write'
  | 'settings.read'
  | 'settings.write'
  | 'billing.read'
  | 'billing.write'
  | 'expenses.read'
  | 'expenses.write'
  | 'invoices.read'
  | 'invoices.write'
  | 'payments.read'
  | 'payments.write';

export type PermissionKey = AppPermission;

export const normalizeUserRoles = (user: User | null | undefined): AppRole[] => getUserRoles(user);

export const roleHasPermission = (user: User | null | undefined, permission: AppPermission): boolean =>
  hasPermission(user, permission);

export const getRoleDisplayName = (role: AppRole): string => {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'client_manager':
      return 'Client Manager';
    case 'project_manager':
      return 'Project Manager';
    case 'user_manager':
      return 'User Manager';
    case 'user':
      return 'User';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
};

const normalizeRole = (role: unknown): AppRole => {
  if (typeof role !== 'string') {
    return 'viewer';
  }

  const lower = role.trim().toLowerCase() as AppRole;
  return (APP_ROLES as readonly string[]).includes(lower) ? lower : 'viewer';
};

const parseRoleList = (roles: unknown): AppRole[] => {
  if (!Array.isArray(roles)) {
    return [];
  }

  const deduped = new Set<AppRole>();
  roles.forEach((role) => deduped.add(normalizeRole(role)));
  return Array.from(deduped);
};

export const getUserRoles = (user: User | null | undefined): AppRole[] => {
  if (!user) {
    return [];
  }

  const fromRoles = parseRoleList((user as User & { roles?: unknown }).roles);
  if (fromRoles.length > 0) {
    return fromRoles;
  }

  return [normalizeRole((user as User).role)];
};

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: [
    'users.read',
    'users.write',
    'users.reset_password',
    'clients.read',
    'clients.write',
    'reports.read',
    'projects.read',
    'projects.write',
    'settings.read',
    'settings.write',
    'billing.read',
    'billing.write',
    'expenses.read',
    'expenses.write',
    'invoices.read',
    'invoices.write',
    'payments.read',
    'payments.write'
  ],
  client_manager: ['clients.read', 'clients.write', 'reports.read'],
  project_manager: ['projects.read', 'projects.write', 'clients.read', 'clients.write', 'reports.read'],
  user_manager: ['users.read', 'users.write', 'users.reset_password'],
  user: [
    'clients.read',
    'clients.write',
    'reports.read',
    'projects.read',
    'expenses.read',
    'expenses.write',
    'invoices.read',
    'invoices.write',
    'payments.read',
    'payments.write',
    'settings.read'
  ],
  viewer: ['settings.read']
};

export const hasRole = (user: User | null | undefined, role: AppRole): boolean => {
  return getUserRoles(user).includes(role);
};

export const hasAnyRole = (user: User | null | undefined, roles: AppRole[]): boolean => {
  const userRoles = getUserRoles(user);
  return roles.some((role) => userRoles.includes(role));
};

export const getPermissionsForUser = (user: User | null | undefined): Set<AppPermission> => {
  const permissions = new Set<AppPermission>();
  getUserRoles(user).forEach((role) => {
    ROLE_PERMISSIONS[role].forEach((permission) => permissions.add(permission));
  });
  return permissions;
};

export const hasPermission = (user: User | null | undefined, permission: AppPermission): boolean => {
  return getPermissionsForUser(user).has(permission);
};
