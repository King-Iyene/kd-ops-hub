import type { UserRole } from '@/store/authStore';

/**
 * Centralised role permissions. Every route and feature checks against
 * these role sets instead of inlining string comparisons.
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  FINANCE: 'finance',
  OPERATIONS: 'operations',
  FIELD_STAFF: 'field_staff',
  DRIVER: 'driver',
} as const;

export type Role = UserRole;

/**
 * Super Admin acts like Admin everywhere — it's a human-only role with a
 * few extra UI privileges (role simulation) rather than new data access.
 */
export const APPROVER_ROLES: Role[] = ['super_admin', 'admin', 'finance'];
/**
 * Who can prepare/manage payment batches and view payment data: the approver
 * roles plus Operations. Operations can create, schedule, edit and view
 * batches, but the money path stays guarded downstream — batches still require
 * an approver, and dispatch is bound by per-role transfer caps (which fail
 * closed: a role with no configured cap cannot move funds).
 */
export const PAYMENT_ROLES: Role[] = ['super_admin', 'admin', 'finance', 'operations'];
export const MANAGER_ROLES: Role[] = [
  'super_admin',
  'admin',
  'finance',
  'operations',
];
/** Sensitive HR/admin pages visible only to super_admin and admin. */
export const ADMIN_ONLY_ROLES: Role[] = ['super_admin', 'admin'];
export const ALL_AUTH_ROLES: Role[] = [
  'super_admin',
  'admin',
  'finance',
  'operations',
  'field_staff',
  'driver',
];

/** Roles that can be chosen from the "View As" simulator (Super Admin only). */
export const SIMULATABLE_ROLES: Role[] = [
  'super_admin',
  'admin',
  'finance',
  'operations',
  'field_staff',
  'driver',
];

/** A compact role label for UI display. */
export const roleLabel = (role: string): string => {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'finance':
      return 'Finance';
    case 'operations':
      return 'Operations';
    case 'field_staff':
      return 'Field Staff';
    case 'driver':
      return 'Fleet Staff';
    default:
      return role || 'Unknown';
  }
};

/**
 * Tailwind classes for a role badge. Uses the KD brand palette for Super
 * Admin (gold) and sensible hue buckets for the rest.
 */
export const roleBadgeClass = (role: string): string => {
  switch (role) {
    case 'super_admin':
      // Gold — KD brand accent #D6AC50.
      return 'bg-accent/15 text-accent-foreground border border-accent/40';
    case 'admin':
      return 'bg-info/10 text-info border border-info/30';
    case 'finance':
      return 'bg-success/10 text-success border border-success/30';
    case 'operations':
      return 'bg-purple-100 text-purple-700 border border-purple-200';
    case 'field_staff':
      return 'bg-muted text-muted-foreground border border-border';
    default:
      return 'bg-muted text-muted-foreground border border-border';
  }
};

export const hasRole = (role: string | undefined, allowed: Role[]): boolean =>
  !!role && (allowed as string[]).includes(role);
