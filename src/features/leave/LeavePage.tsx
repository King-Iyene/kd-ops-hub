// The Leave module. Everyone gets "My leave" and "Who's away". Admins get a second row of
// tools: what needs deciding, every leave, and everyone's balances.
import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ClipboardCheck, Scale, Settings2, ShieldCheck, UserRound, Users, ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useAllLeave, useLeaveLive, useMyLeave } from './leaveApi';
import { AllLeaveTab } from './AllLeaveTab';
import { BalancesTab } from './BalancesTab';
import { LeaveDetailSheet } from './LeaveDetailSheet';
import { MyLeaveTab } from './MyLeaveTab';
import { NeedsReviewTab } from './NeedsReviewTab';
import { RequestDialog, type RequestMode } from './RequestDialog';
import { WhosAwayTab } from './WhosAwayTab';
import type { LeaveRow } from './types';

type TabKey = 'mine' | 'away' | 'review' | 'all' | 'balances';

export default function LeavePage() {
  usePageTitle('Leave');
  const profile = useAuthStore((s) => s.profile);
  const canApprove = usePermission('leave.approve');
  const isAdmin = (profile?.role === 'super_admin' || profile?.role === 'admin') && canApprove;
  useLeaveLive();

  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as TabKey | null;
  const allowed: TabKey[] = isAdmin ? ['mine', 'away', 'review', 'all', 'balances'] : ['mine', 'away'];
  const tab: TabKey = requested && allowed.includes(requested) ? requested : isAdmin ? 'review' : 'mine';
  const setTab = (t: TabKey) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const all = useAllLeave(isAdmin);
  const mine = useMyLeave(profile?.id);
  const waiting = useMemo(() => (all.data ?? []).filter((r) => r.status === 'pending').length, [all.data]);

  const [openId, setOpenId] = useState<string | null>(null);
  const openRow: LeaveRow | null = useMemo(
    () => (openId ? (all.data ?? []).find((r) => r.id === openId) ?? (mine.data ?? []).find((r) => r.id === openId) ?? null : null),
    [openId, all.data, mine.data],
  );
  const [dialog, setDialog] = useState<null | RequestMode>(null);

  const tabs: { key: TabKey; label: string; icon: typeof CalendarDays; count?: number; admin?: boolean }[] = [
    { key: 'mine', label: 'My leave', icon: UserRound },
    { key: 'away', label: 'Who’s away', icon: Users },
    ...(isAdmin ? [
      { key: 'review' as const, label: 'Needs review', icon: ClipboardCheck, count: waiting, admin: true },
      { key: 'all' as const, label: 'All leave', icon: ListChecks, admin: true },
      { key: 'balances' as const, label: 'Balances', icon: Scale, admin: true },
    ] : []),
  ];

  if (mine.isError && !mine.data) return <ErrorState message="Leave could not be loaded." onRetry={() => void mine.refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leave"
        icon={CalendarDays}
        description={isAdmin ? 'Request your own leave, see who is away, and manage everyone’s leave.' : 'Request time off and see who is away.'}
        actions={<Button onClick={() => setDialog('request')}><CalendarPlus className="mr-1.5 h-4 w-4" />Request leave</Button>}
      />

      <nav aria-label="Leave sections">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {tabs.filter((t) => !t.admin).map((t) => <TabButton key={t.key} t={t} active={tab === t.key} onClick={() => setTab(t.key)} />)}
          {isAdmin && (
            <>
              <span className="mx-2 hidden h-6 w-px bg-border sm:block" aria-hidden /><span className="basis-full sm:hidden" aria-hidden />
              <span className="mr-1 flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary"><ShieldCheck className="h-3.5 w-3.5" />Admin</span>
              {tabs.filter((t) => t.admin).map((t) => <TabButton key={t.key} t={t} active={tab === t.key} onClick={() => setTab(t.key)} />)}
              <Link to="/settings" className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Leave types, yearly allowances and carry-over are in Settings, under Leave">
                <Settings2 className="h-4 w-4" />Leave rules
              </Link>
            </>
          )}
        </div>
      </nav>

      <div role="region" aria-label={tabs.find((t) => t.key === tab)?.label}>
        {tab === 'mine' && <MyLeaveTab onRequest={() => setDialog('request')} onOpen={(r) => setOpenId(r.id)} />}
        {tab === 'away' && <WhosAwayTab admin={isAdmin} onOpen={setOpenId} />}
        {isAdmin && tab === 'review' && <NeedsReviewTab onOpen={(r) => setOpenId(r.id)} />}
        {isAdmin && tab === 'all' && <AllLeaveTab onOpen={(r) => setOpenId(r.id)} onAdd={() => setDialog('record')} />}
        {isAdmin && tab === 'balances' && <BalancesTab />}
      </div>

      <LeaveDetailSheet row={openRow} admin={isAdmin} onClose={() => setOpenId(null)} />
      <RequestDialog open={dialog === 'request' || dialog === 'record'} mode={dialog === 'record' ? 'record' : 'request'} onClose={() => setDialog(null)} />
    </div>
  );
}

function TabButton({ t, active, onClick }: { t: { label: string; icon: typeof CalendarDays; count?: number }; active: boolean; onClick: () => void }) {
  const Icon = t.icon;
  return (
    <button
      type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors', active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
    >
      <Icon className="h-4 w-4" />{t.label}
      {t.count ? <span className={cn('ml-0.5 min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums', active ? 'bg-primary-foreground/25' : 'bg-amber-500 text-white')}>{t.count}</span> : null}
    </button>
  );
}
