// Constants and utilities extracted from shared.tsx
// to satisfy react-refresh/only-export-components.

import { roleBadgeClass, roleLabel } from '@/lib/roles';

export type Role = 'everyone' | 'super_admin' | 'admin' | 'finance' | 'operations' | 'field_staff';

export const ROLE_CONFIG: Record<Role, { label: string; className: string }> = {
  everyone: { label: 'Everyone', className: 'bg-primary/10 text-primary border-primary/20' },
  super_admin: { label: roleLabel('super_admin'), className: roleBadgeClass('super_admin') },
  admin: { label: roleLabel('admin'), className: roleBadgeClass('admin') },
  finance: { label: roleLabel('finance'), className: roleBadgeClass('finance') },
  operations: { label: roleLabel('operations'), className: roleBadgeClass('operations') },
  field_staff: { label: 'Field Team', className: roleBadgeClass('field_staff') },
};

// ── Video embed helper ─────────────────────────────────────────────────────────
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string)?.trim() ?? '';

export function guideVideoUrl(filename: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/guide-videos/${filename}`;
}
