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
];

/** Roles that can be chosen from the "View As" simulator (Super Admin only). */
export const SIMULATABLE_ROLES: Role[] = [
  'super_admin',
  'admin',
  'finance',
  'operations',
  'field_staff',
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
      return 'Field Team';
    default:
      return role || 'Unknown';
  }
};

/**
 * Tailwind classes for a role badge. Uses the KD brand palette for Super
 * Admin (gold) and sensible hue buckets for the rest.
 */
/**
 * Tailwind classes for a role badge — one dedicated hue per role (see
 * --kd-gold/--role-admin/--role-finance/--role-operations in index.css),
 * never a status token (success/warning/info/destructive). Those carry
 * "good/bad/in-progress" meaning that has nothing to do with who someone
 * is, and reusing them here is what made role colors read as arbitrary.
 * field_staff stays neutral gray — the base/no-elevated-access role.
 */
export const roleBadgeClass = (role: string): string => {
  switch (role) {
    case 'super_admin':
      return 'bg-kd-gold/15 text-kd-gold border border-kd-gold/40';
    case 'admin':
      return 'bg-role-admin/10 text-role-admin border border-role-admin/30';
    case 'finance':
      return 'bg-role-finance/10 text-role-finance border border-role-finance/30';
    case 'operations':
      return 'bg-role-operations/10 text-role-operations border border-role-operations/30';
    case 'field_staff':
      return 'bg-muted text-muted-foreground border border-border';
    default:
      return 'bg-muted text-muted-foreground border border-border';
  }
};

/** Solid-fill dot/ring color for the same role hues — avatar rings,
 * legend dots. Kept alongside roleBadgeClass so every "whose role is
 * this" indicator in the app draws from one definition. */
export const roleDotClass = (role: string): string => {
  switch (role) {
    case 'super_admin': return 'bg-kd-gold';
    case 'admin': return 'bg-role-admin';
    case 'finance': return 'bg-role-finance';
    case 'operations': return 'bg-role-operations';
    default: return 'bg-muted-foreground';
  }
};

export const roleRingClass = (role: string): string => {
  switch (role) {
    case 'super_admin': return 'ring-kd-gold/50';
    case 'admin': return 'ring-role-admin/40';
    case 'finance': return 'ring-role-finance/40';
    case 'operations': return 'ring-role-operations/40';
    default: return 'ring-border';
  }
};

export const hasRole = (role: string | undefined, allowed: Role[]): boolean =>
  !!role && (allowed as string[]).includes(role);
