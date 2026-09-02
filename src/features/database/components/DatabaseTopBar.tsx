import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, Search, HelpCircle, Share2 } from 'lucide-react';
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
    <header className="flex items-center justify-between h-11 px-3 bg-white dark:bg-[hsl(200,30%,8%)] border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] shrink-0">
      <div className="flex items-center gap-1.5">
        <Link
          to="/"
          className="p-1.5 rounded-md hover:bg-[#F4F4F5] text-[#6A7184] transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[#6A7184] hover:bg-[#F4F4F5]"
          onClick={toggleSidebar}
        >
          <Menu size={16} />
        </Button>
        <div className="flex items-center gap-1 ml-1">
          <span className="text-[13px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
            KDOps Data
          </span>
          {activeBase && (
            <>
              <span className="text-[#D5D5D9] text-sm mx-0.5">/</span>
              <span
                className="text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)] font-medium truncate max-w-[160px]"
              >
                {activeBase.name}
              </span>
            </>
          )}
          {activeTable && (
            <>
              <span className="text-[#D5D5D9] text-sm mx-0.5">/</span>
              <span className="text-[13px] text-[#6A7184] truncate max-w-[160px]">
                {activeTable.name}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12px] text-[#6A7184] hover:bg-[#F4F4F5] gap-1"
        >
          <Share2 size={13} /> Share
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[#6A7184] hover:bg-[#F4F4F5]"
        >
          <HelpCircle size={15} />
        </Button>
        <div
          className="h-7 w-7 rounded-full bg-[#3366FF] text-white flex items-center justify-center text-[10px] font-semibold select-none ml-1"
          title={profile?.full_name ?? ''}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
