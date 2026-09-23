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

/**
 * Returns true if the user has been explicitly granted a permission via the
 * JSONB column (permission === true). Use this to enable buttons/features
 * for users whose role would not normally have access.
 */
export function hasExplicitPermission(
  profile: { role?: string; permissions?: Record<string, boolean> | null } | null,
  permission: string,
): boolean {
  if (!profile) return false;
  if (profile.role === 'super_admin') return true;
  const perms = profile.permissions;
  return !!(perms && perms[permission] === true);
}
