// Every leave for everyone, with simple filters. Click a row to see its history and change it.
import { useMemo, useState } from 'react';
import { Download, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAllLeave } from './leaveApi';
import { addDays, daysLabel, isoDate, leaveToCsv, rangeLabel, relativeStart } from './leaveMath';
import { LeaveStatusPill, PersonAvatar, TypeChip } from './leaveUi';
import { STATUS_LABEL } from './leaveLabels';
import { useLookups } from './useLookups';
import type { LeaveRow, LeaveStatus } from './types';

type StatusFilter = 'all' | LeaveStatus;
type TimeFilter = 'any' | 'now' | 'upcoming' | 'past' | 'month' | 'next30';
const PAGE = 40;

const TIME_LABEL: Record<TimeFilter, string> = {
  any: 'Any time', now: 'Away right now', upcoming: 'Coming up', past: 'Already finished', month: 'This month', next30: 'Next 30 days',
};

export function AllLeaveTab({ onOpen, onAdd }: { onOpen: (r: LeaveRow) => void; onAdd: () => void }) {
  const { data: all, isLoading } = useAllLeave(true);
  const lookups = useLookups();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [time, setTime] = useState<TimeFilter>('any');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const today = isoDate(new Date());

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const r of all ?? []) { c.all += 1; c[r.status] += 1; }
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = `${today.slice(0, 7)}-31`;
    return (all ?? []).filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (type !== 'all' && r.leave_type !== type) return false;
      if (needle && !lookups.nameOf(r.employee_id).toLowerCase().includes(needle)) return false;
      switch (time) {
        case 'now': return r.status === 'approved' && r.start_date <= today && r.end_date >= today;
        case 'upcoming': return r.end_date >= today;
        case 'past': return r.end_date < today;
        case 'month': return r.start_date <= monthEnd && r.end_date >= monthStart;
        case 'next30': return r.start_date <= addDays(today, 30) && r.end_date >= today;
        default: return true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, status, type, time, q, today, lookups.people]);

  const totalDays = rows.filter((r) => r.status === 'approved').reduce((n, r) => n + Number(r.days_requested), 0);
  const filtered = status !== 'all' || time !== 'any' || type !== 'all' || q.trim() !== '';

  const exportCsv = () => {
    const blob = new Blob([leaveToCsv(rows, lookups.nameOf)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leave-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map((s) => (
          <button
            key={s} type="button" onClick={() => { setStatus(s); setShown(PAGE); }} aria-pressed={status === s}
            className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', status === s ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted')}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]} <span className="ml-1 tabular-nums opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Find a person" className="pl-9" aria-label="Find a person" />
        </div>
        <Select value={time} onValueChange={(v) => { setTime(v as TimeFilter); setShown(PAGE); }}>
          <SelectTrigger className="w-[170px]" aria-label="When"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(TIME_LABEL) as TimeFilter[]).map((k) => <SelectItem key={k} value={k}>{TIME_LABEL[k]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setShown(PAGE); }}>
          <SelectTrigger className="w-[170px]" aria-label="Kind of leave"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {lookups.types.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setStatus('all'); setTime('any'); setType('all'); setQ(''); }}>Clear filters</Button>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}><Download className="mr-1.5 h-4 w-4" />Download list</Button>
          <Button size="sm" onClick={onAdd}><Plus className="mr-1.5 h-4 w-4" />Add leave for someone</Button>
        </div>
      </div>

      {isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-14 text-center text-sm text-muted-foreground">{filtered ? 'No leave matches these filters.' : 'No leave has been requested yet.'}</div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{rows.length} leave{rows.length === 1 ? '' : 's'}{totalDays ? ` · ${daysLabel(totalDays)} approved` : ''}</p>
          <ul className="divide-y rounded-2xl border bg-card">
            {rows.slice(0, shown).map((r) => {
              const p = lookups.person(r.employee_id);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    <PersonAvatar name={p?.full_name} photo={p?.photo_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{lookups.nameOf(r.employee_id)}</p>
                      <p className="truncate text-sm text-muted-foreground">{rangeLabel(r.start_date, r.end_date)} · {daysLabel(Number(r.days_requested))}{r.status === 'approved' ? ` · ${relativeStart(r.start_date, r.end_date, today)}` : ''}</p>
                    </div>
                    <TypeChip name={lookups.typeName(r.leave_type).replace(/ Leave$/, '')} color={lookups.typeColor(r.leave_type)} className="hidden sm:inline-flex" />
                    <LeaveStatusPill status={r.status} short />
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > shown && <div className="text-center"><Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>Show more ({rows.length - shown} left)</Button></div>}
        </>
      )}
    </div>
  );
}
