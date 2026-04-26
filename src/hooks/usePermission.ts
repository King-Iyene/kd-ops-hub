import { useAuthStore } from '@/store/authStore';
import { isPermissionDenied } from '@/components/RoleGuard';

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
