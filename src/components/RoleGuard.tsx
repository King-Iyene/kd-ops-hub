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
 * Route-level guard. Shows a spinner while auth state resolves, redirects
 * unauthenticated users to /login, and sends users without one of the
 * allowed roles to /unauthorized.
 *
 * For Super Admin users simulating another role via the "View As" selector,
 * the simulated role is used here — so that navigating via the sidebar
 * matches what other roles can actually see.
 */
export function RoleGuard({ roles, children, inline = false }: Props) {
  const { user, profile, loading, profileLoading } = useAuthStore();
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
