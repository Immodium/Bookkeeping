import { UserRole } from '../types/index.js';

export const SYSTEM_ROLES: UserRole[] = [
  'admin',
  'client_manager',
  'project_manager',
  'user_manager',
  'user',
  'viewer'
];

export const normalizeRoles = (roles: unknown): UserRole[] => {
  if (!Array.isArray(roles)) {
    return [];
  }

  const normalized = new Set<UserRole>();
  for (const role of roles) {
    if (typeof role !== 'string') {
      continue;
    }

    const trimmed = role.trim() as UserRole;
    if (SYSTEM_ROLES.includes(trimmed)) {
      normalized.add(trimmed);
    }
  }

  return Array.from(normalized);
};

export const normalizeRole = (role: unknown): UserRole => {
  if (typeof role !== 'string') {
    return 'user';
  }
  const trimmed = role.trim() as UserRole;
  return SYSTEM_ROLES.includes(trimmed) ? trimmed : 'user';
};

export const getPrimaryRole = (roles: unknown, fallbackRole: unknown = 'user'): UserRole => {
  const normalized = normalizeRoles(Array.isArray(roles) ? roles : []);
  if (normalized.length > 0) {
    return normalized[0]!;
  }
  return normalizeRole(fallbackRole);
};

const getUserRolesArray = (userLike: { roles?: unknown; role?: unknown } | null | undefined): UserRole[] => {
  if (!userLike) {
    return [];
  }
  const fromRoles = normalizeRoles(userLike.roles);
  if (fromRoles.length > 0) {
    return fromRoles;
  }
  return [normalizeRole(userLike.role)];
};

export const hasRole = (userRoles: UserRole[] | undefined, role: UserRole): boolean => {
  return !!userRoles?.includes(role);
};

export const hasAnyRole = (userRoles: UserRole[] | undefined, roles: UserRole[]): boolean => {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  return roles.some((role) => userRoles.includes(role));
};

export const userHasRole = (userLike: { roles?: unknown; role?: unknown } | null | undefined, role: UserRole): boolean => {
  return getUserRolesArray(userLike).includes(role);
};

export const userHasAnyRole = (
  userLike: { roles?: unknown; role?: unknown } | null | undefined,
  roles: UserRole[]
): boolean => {
  const userRoles = getUserRolesArray(userLike);
  return roles.some((role) => userRoles.includes(role));
};
