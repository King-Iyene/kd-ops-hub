import { X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { roleLabel } from '@/lib/roles';

/**
 * Slim gold banner shown to a Super Admin when simulating another role.
 * Clicking the banner anywhere clears the simulation and returns to the
 * Super Admin view.
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
      className="w-full flex items-center justify-center gap-2 py-1.5 text-sm font-medium text-[#3a2e12] bg-[#D6AC50] hover:bg-[#c89a3e] kd-transition focus:outline-none shadow-sm"
      style={{ letterSpacing: '0.01em' }}
    >
      <span aria-hidden="true">👁</span>
      <span>
        Viewing as: <span className="font-bold">{roleLabel(viewAs)}</span>
      </span>
      <span className="mx-2 text-[#3a2e12]/60">—</span>
      <span className="inline-flex items-center gap-1 underline underline-offset-2">
        <X className="h-3.5 w-3.5" /> Click to exit
      </span>
    </button>
  );
}
