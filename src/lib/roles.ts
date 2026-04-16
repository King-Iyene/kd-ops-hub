/**
 * Helpers for pretty-printing a profile role in the UI.
 *
 * Role-based access control was removed from KDOps — every signed-in user
 * can see every page and perform every action. The role column remains in
 * the profiles table purely as an informational label, which is surfaced
 * on the My Profile page.
 */

/** A compact role label for UI display. */
export const roleLabel = (role: string | null | undefined): string => {
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
      return 'Driver';
    default:
      return role || 'Unknown';
  }
};

/** Tailwind classes for a role badge (used on the Profile page only). */
export const roleBadgeClass = (role: string | null | undefined): string => {
  switch (role) {
    case 'super_admin':
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
