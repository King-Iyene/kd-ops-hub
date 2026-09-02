import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useDatabaseUI } from '../lib/store';
import { useBases, useTables } from '../hooks';

export function DatabaseTopBar() {
  const { toggleSidebar, activeBaseId, activeTableId } = useDatabaseUI();
  const profile = useAuthStore((s) => s.profile);
  const { data: bases } = useBases();
  const { data: tables } = useTables(activeBaseId);

  const activeBase = bases?.find((b: any) => b.id === activeBaseId);
  const activeTable = tables?.find((t: any) => t.id === activeTableId);

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="flex items-center justify-between h-12 px-3 bg-white border-b border-[#E2E8F0] shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2">
        <Link to="/" className="p-1.5 rounded hover:bg-gray-100 text-[#475569]">
          <ArrowLeft size={18} />
        </Link>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
          <Menu size={18} />
        </Button>
        <span className="text-sm font-semibold text-[#006994] select-none">KDOps Data</span>
        {activeBase && (
          <>
            <span className="text-[#94A3B8] text-xs">/</span>
            <span className="text-xs text-[#0F172A] font-medium truncate max-w-[140px]">
              {activeBase.name}
            </span>
          </>
        )}
        {activeTable && (
          <>
            <span className="text-[#94A3B8] text-xs">/</span>
            <span className="text-xs text-[#475569] truncate max-w-[140px]">
              {activeTable.name}
            </span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#475569]">
          <Search size={16} />
        </Button>
        <div
          className="h-7 w-7 rounded-full bg-[#006994] text-white flex items-center justify-center text-[11px] font-medium select-none"
          title={profile?.full_name ?? ''}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}
