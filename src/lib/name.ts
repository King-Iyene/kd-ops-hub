export const displayName = (first?: string | null, last?: string | null, fallback?: string | null): string => {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (f && l) return `${f} ${l}`;
  if (f) return f;
  if (l) return l;
  return fallback || '—';
};

export const initialsOf = (first?: string | null, last?: string | null, fallback?: string | null): string => {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f[0]?.toUpperCase() || 'U';
  if (fallback) {
    const parts = fallback.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || 'U';
  }
  return 'U';
};
