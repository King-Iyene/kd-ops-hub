/**
 * Task module formatting helpers (master prompt section 8). Kept separate
 * from the app-wide src/lib/utils.ts initials() because the PRD's rule for
 * a single-word name differs: one letter, not two (section 5.6 — "K" for
 * "KD", not "KD").
 */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
