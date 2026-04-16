import { Eye, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { roleLabel } from '@/lib/roles';

/**
 * Persistent gold banner shown to a Super Admin when simulating another
 * role via the ProfileDropdown. Clicking the banner (anywhere) clears
 * the simulation and returns to the Super Admin view.
 */
export function ViewAsBanner() {
  const profile = useAuthStore((s) => s.profile);
  const viewAs = useAuthStore((s) => s.viewAsRole);
  const setViewAsRole = useAuthStore((s) => s.setViewAsRole);

  if (profile?.role !== 'super_admin' || !viewAs) return null;

  return (
    <button
      type="button"
      onClick={() => setViewAsRole(null)}
      title="Click to exit simulation"
      // KD gold #D6AC50 — primary brand accent for simulation mode.
      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-[#3a2e12] bg-[#D6AC50] hover:bg-[#c89a3e] kd-transition focus:outline-none shadow-sm"
      style={{ letterSpacing: '0.01em' }}
    >
      <Eye className="h-4 w-4" />
      <span>
        Viewing as: <span className="font-bold">{roleLabel(viewAs)}</span>
      </span>
      <span className="mx-2 text-[#3a2e12]/50">·</span>
      <span className="inline-flex items-center gap-1 underline underline-offset-2">
        <X className="h-3.5 w-3.5" /> Click to exit
      </span>
    </button>
  );
}
