import { useAuthStore } from '@/store/authStore';
import { isPermissionDenied, hasExplicitPermission } from '@/components/RoleGuard';
import { hasRole, type Role } from '@/lib/roles';

/**
 * Returns true when the current user is allowed to perform the given action.
 * Super admins are always allowed. For all other roles the permissions JSONB
 * on their profile is consulted — a key explicitly set to false means denied;
 * absent (undefined) means allowed (defaults-open, role already gated the page).
 */
export function usePermission(key: string): boolean {
  const { profile } = useAuthStore();
  return !isPermissionDenied(profile, key);
}

/**
 * Stricter check: the user must EITHER have a role in `allowedRoles` OR
 * have the permission explicitly set to true. Use this to gate buttons /
 * features whose default visibility is role-restricted but can be granted
 * to lower-privilege roles via the permissions JSONB.
 */
export function useFeatureAccess(key: string, allowedRoles: Role[]): boolean {
  const { profile } = useAuthStore();
  if (!profile) return false;
  if (profile.role === 'super_admin') return true;
  if (isPermissionDenied(profile, key)) return false;
  if (hasRole(profile.role as Role, allowedRoles)) return true;
  return hasExplicitPermission(profile, key);
}
