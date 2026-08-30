import { useEffect } from 'react';
import { Eye, X, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { roleLabel, SIMULATABLE_ROLES } from '@/lib/roles';
import type { UserRole } from '@/store/authStore';

/**
 * Gold banner shown to a Super Admin when simulating another role.
 * GHL-inspired: inline dropdown for quick role switching + Esc to exit.
 */
export function ViewAsBanner() {
  const profile = useAuthStore((s) => s.profile);
  const viewAs = useAuthStore((s) => s.viewAsRole);
  const setViewAsRole = useAuthStore((s) => s.setViewAsRole);

  useEffect(() => {
    if (profile?.role !== 'super_admin' || !viewAs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable) return;
        const dialog = target?.closest('[role="dialog"]');
        if (dialog) return;
        e.preventDefault();
        setViewAsRole(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profile?.role, viewAs, setViewAsRole]);

  if (profile?.role !== 'super_admin' || !viewAs) return null;

  const otherRoles = SIMULATABLE_ROLES.filter((r) => r !== viewAs);

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-1.5 text-sm font-medium text-[#3a2e12] bg-gradient-to-r from-[#D6AC50] via-[#e0bc60] to-[#D6AC50] shadow-sm"
      style={{ letterSpacing: '0.01em' }}
    >
      <Eye className="h-4 w-4 shrink-0 opacity-70" />

      <span className="flex items-center gap-1.5">
        Viewing as:
        <span className="relative inline-flex items-center">
          <select
            value={viewAs}
            onChange={(e) => setViewAsRole(e.target.value as UserRole)}
            className="appearance-none bg-[#3a2e12]/10 hover:bg-[#3a2e12]/20 rounded-md pl-2 pr-6 py-0.5 text-sm font-bold cursor-pointer border-0 outline-none kd-transition text-[#3a2e12]"
            aria-label="Switch simulated role"
          >
            <option value={viewAs}>{roleLabel(viewAs)}</option>
            {otherRoles.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 h-3 w-3 pointer-events-none opacity-60" />
        </span>
      </span>

      <span className="text-[#3a2e12]/40 select-none">|</span>

      <button
        type="button"
        onClick={() => setViewAsRole(null)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-[#3a2e12]/10 hover:bg-[#3a2e12]/20 kd-transition"
        title="Exit simulation (Esc)"
      >
        <X className="h-3 w-3" /> Exit
        <kbd className="hidden lg:inline ml-0.5 text-[10px] opacity-60 font-mono">Esc</kbd>
      </button>
    </div>
  );
}
