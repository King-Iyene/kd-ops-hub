import type { UserRole } from '@/store/authStore';

/**
 * Centralised role permissions. Every route and feature checks against
 * these role sets instead of inlining string comparisons.
 */
export const ROLES = {
  ADMIN: 'admin',
  FINANCE: 'finance',
  OPERATIONS: 'operations',
  FIELD_STAFF: 'field_staff',
  DRIVER: 'driver',
} as const;

export type Role = UserRole;

export const APPROVER_ROLES: Role[] = ['admin', 'finance'];
export const MANAGER_ROLES: Role[] = ['admin', 'finance', 'operations'];
export const ALL_AUTH_ROLES: Role[] = [
  'admin',
  'finance',
  'operations',
  'field_staff',
  'driver',
];

/** A compact role label for UI display. */
export const roleLabel = (role: string): string => {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'finance':
      return 'Finance';
    case 'operations':
      return 'Operations';
    case 'field_staff':
      return 'Field Staff';
    case 'driver':
      return 'Driver';
    default:
      return role || 'Unknown';
  }
};

export const hasRole = (role: string | undefined, allowed: Role[]): boolean =>
  !!role && (allowed as string[]).includes(role);
