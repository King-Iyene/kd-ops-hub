import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { hasRole, type Role } from '@/lib/roles';

interface Props {
  roles: Role[];
  children: React.ReactNode;
  inline?: boolean;
}

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

  if (!profile || profile.status !== 'active') {
    return <Navigate to="/unauthorized" replace />;
  }

  if (profile.role === 'super_admin' && !viewAsRole) {
    return <>{children}</>;
  }

  if (!effectiveRole) {
    return <>{children}</>;
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

  return <>{children}</>;
}
