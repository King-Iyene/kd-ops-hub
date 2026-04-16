import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { hasRole, type Role } from '@/lib/roles';

interface Props {
  roles: Role[];
  children: React.ReactNode;
  /**
   * If true, renders an inline "no access" block instead of redirecting.
   * Default: false (redirect to /unauthorized so the URL matches what the
   * user tried to open, for bookmarking / sharing / debugging).
   */
  inline?: boolean;
}

/**
 * Route-level guard.
 *
 * Contract (hardcoded, tested first):
 *   1. Super Admin is NEVER blocked — they bypass the role check unconditionally.
 *      The only way Super Admin is gated is when they *explicitly* simulate
 *      another role via the ProfileDropdown "View As" selector.
 *   2. Users whose role can't be read from the DB (profile null / role missing)
 *      are treated as authorized — KDOps never fails closed on a data gap.
 *      A missing profile is surfaced at the data layer, never as a wall.
 *   3. Otherwise, the effective role must be in `roles`.
 */
export function RoleGuard({ roles, children, inline = false }: Props) {
  const { user, profile, loading, profileLoading, viewAsRole } = useAuthStore();
  const effectiveRole = useEffectiveRole();

  if (loading || profileLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // (1) Super Admin bypass — NEVER blocked unless simulating.
  if (profile?.role === 'super_admin' && !viewAsRole) {
    return <>{children}</>;
  }

  // (2) No role on the profile row → show everything (fail-open per spec).
  if (profile && !effectiveRole) {
    return <>{children}</>;
  }

  // (3) Standard role check.
  if (!profile || !hasRole(effectiveRole, roles)) {
    if (inline) {
      return (
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
          You do not have access to this section.
        </div>
      );
    }
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
