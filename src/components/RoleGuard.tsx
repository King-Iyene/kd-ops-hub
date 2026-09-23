import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { hasRole, type Role } from '@/lib/roles';

interface Props {
  roles: Role[];
  children: React.ReactNode;
  inline?: boolean;
  /** Optional permission key from the JSONB permissions column. Two effects:
   *  1. If the user's role is in `roles`, access is denied if the permission
   *     is explicitly `false` (revoke from a role that would normally allow).
   *  2. If the user's role is NOT in `roles`, access is granted if the
   *     permission is explicitly `true` (grant to a role that would normally
   *     not allow). Undefined falls back to role-only behaviour.
   */
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
    return <Navigate to="/dashboard" replace />;
  }

  const perms = (profile as any).permissions as Record<string, boolean> | null | undefined;
  const explicitGrant = !!permission && perms?.[permission] === true;
  const explicitDeny = !!permission && perms?.[permission] === false;
  const roleAllows = hasRole(effectiveRole, roles);

  // Role grants access unless permission is explicitly revoked
  if (roleAllows && !explicitDeny) {
    return <>{children}</>;
  }

  // Role does not grant access — but a permission grant can override
  if (!roleAllows && explicitGrant) {
    return <>{children}</>;
  }

  if (inline) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
        You do not have access to this section.
      </div>
    );
  }
  return <Navigate to="/dashboard" replace />;
}
