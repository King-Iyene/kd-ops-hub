import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { hasRole, type Role } from '@/lib/roles';

interface Props {
  roles: Role[];
  children: React.ReactNode;
  inline?: boolean;
  /** Optional permission key from the JSONB permissions column. When set,
   *  access is denied if the user's permissions object has this key set to false,
   *  even when the role would normally allow access. */
  permission?: string;
}

export function RoleGuard({ roles, children, inline = false, permission }: Props) {
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

  if (!profile || profile.status !== 'active') {
    return <Navigate to="/unauthorized" replace />;
  }

  if (profile.role === 'super_admin' && !viewAsRole) {
    return <>{children}</>;
  }

  if (!effectiveRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (!hasRole(effectiveRole, roles)) {
    if (inline) {
      return (
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
          You do not have access to this section.
        </div>
      );
    }
    return <Navigate to="/unauthorized" replace />;
  }

  if (permission) {
    const perms = (profile as any).permissions as Record<string, boolean> | null | undefined;
    if (perms && perms[permission] === false) {
      if (inline) {
        return (
          <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
            You do not have access to this section.
          </div>
        );
      }
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}

/**
 * Imperative check for use outside JSX (event handlers, conditionals).
 * Returns true if the profile's permissions JSONB denies the given key.
 * Super_admin always returns false (never denied).
 */
export function isPermissionDenied(
  profile: { role?: string; permissions?: Record<string, boolean> | null } | null,
  permission: string,
): boolean {
  if (!profile) return true;
  if (profile.role === 'super_admin') return false;
  const perms = profile.permissions;
  if (perms && perms[permission] === false) return true;
  return false;
}
