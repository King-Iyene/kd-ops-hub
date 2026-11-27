// Who is out, for everyone: today, this week, the next month, and a month calendar.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAway } from './leaveApi';
import { addDays, groupAway, isoDate, nextWorkday, niceDate, rangeLabel } from './leaveMath';
import { PersonAvatar } from './leaveUi';
import { useLookups } from './useLookups';
import type { AwayRow } from './types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function WhosAwayTab({ admin, onOpen }: { admin: boolean; onOpen?: (leaveId: string) => void }) {
  const lookups = useLookups();
  const today = isoDate(new Date());
  const [month, setMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const first = `${month.y}-${String(month.m + 1).padStart(2, '0')}-01`;
  const gridStart = (() => { const d = new Date(`${first}T00:00:00Z`); return addDays(first, -((d.getUTCDay() + 6) % 7)); })();
  const gridEnd = addDays(gridStart, 41);

  const soonQ = useAway(addDays(today, -1), addDays(today, 35));
  const monthQ = useAway(gridStart, gridEnd);
  const groups = useMemo(() => groupAway(soonQ.data ?? [], today), [soonQ.data, today]);

  const cells = useMemo(() => {
    const out: { iso: string; inMonth: boolean; rows: AwayRow[] }[] = [];
    for (let i = 0; i < 42; i++) {
      const iso = addDays(gridStart, i);
      const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
      const rows = dow >= 5 ? [] : (monthQ.data ?? []).filter((r) => r.start_date <= iso && r.end_date >= iso);
      out.push({ iso, inMonth: iso.slice(0, 7) === first.slice(0, 7), rows });
    }
    return out;
  }, [monthQ.data, gridStart, first]);

  const shift = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Who is away">
        <Group title="Away today" empty="Everyone is in today." loading={soonQ.isLoading} rows={groups.awayNow} lookups={lookups} onOpen={onOpen} admin={admin}
          sub={(r) => (r.end_date === today ? 'Back tomorrow' : `Back ${niceDate(nextWorkday(r.end_date), false)}`)} accent />
        <Group title="Later this week" empty="Nobody else this week." loading={soonQ.isLoading} rows={groups.thisWeek} lookups={lookups} onOpen={onOpen} admin={admin}
          sub={(r) => rangeLabel(r.start_date, r.end_date).replace(/ \d{4}$/, '')} />
        <Group title="Next 30 days" empty="Nothing planned yet." loading={soonQ.isLoading} rows={groups.soon} lookups={lookups} onOpen={onOpen} admin={admin}
          sub={(r) => rangeLabel(r.start_date, r.end_date).replace(/ \d{4}$/, '')} />
      </section>

      <section aria-label="Calendar" className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{MONTHS[month.m]} {month.y}</h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setMonth({ y: new Date().getFullYear(), m: new Date().getMonth() })}>Today</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {monthQ.isLoading ? <Skeleton className="h-72 w-full" /> : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-5 gap-px overflow-hidden rounded-xl border bg-border">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => <div key={d} className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>)}
              {cells.filter((_, i) => i % 7 < 5).map((c) => (
                <div key={c.iso} className={cn('min-h-[84px] bg-card p-1.5 text-xs', !c.inMonth && 'bg-muted/30 text-muted-foreground/60', c.iso === today && 'ring-2 ring-inset ring-primary')}>
                  <p className={cn('mb-1 font-medium', c.iso === today && 'text-primary')}>{Number(c.iso.slice(8))}</p>
                  <ul className="space-y-0.5">
                    {c.rows.slice(0, 3).map((r) => (
                      <li key={r.leave_id} title={`${r.employee_name}${r.status === 'pending' ? ' (waiting for approval)' : ''}`}
                        className={cn('truncate rounded px-1.5 py-0.5 text-[11px] leading-tight', r.status === 'pending' ? 'border border-dashed border-amber-500/60 text-amber-800 dark:text-amber-200' : 'bg-primary/10 text-foreground')}
                        style={r.leave_type && r.status === 'approved' ? { background: `${lookups.typeColor(r.leave_type)}22` } : undefined}>
                        {r.employee_name.split(' ')[0]}
                      </li>
                    ))}
                    {c.rows.length > 3 && <li className="px-1 text-[11px] text-muted-foreground">+{c.rows.length - 3} more</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{admin ? 'Dashed outline means it is still waiting for approval. Colours show the kind of leave.' : 'Only approved leave is shown, with names and dates.'}</p>
      </section>
    </div>
  );
}

function Group({ title, rows, empty, sub, loading, lookups, accent, admin, onOpen }: {
  title: string; rows: AwayRow[]; empty: string; sub: (r: AwayRow) => string; loading: boolean; accent?: boolean;
  lookups: ReturnType<typeof useLookups>; admin: boolean; onOpen?: (leaveId: string) => void;
}) {
  return (
    <div className={cn('rounded-2xl border bg-card p-4', accent && rows.length > 0 && 'border-primary/30 bg-primary/[0.03]')}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">{accent && <Sun className="h-4 w-4 text-amber-500" />}{title}{rows.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{rows.length}</span>}</h2>
      {loading ? <Skeleton className="h-16 w-full" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-2.5">
          {rows.slice(0, 8).map((r) => {
            const p = lookups.person(r.employee_id);
            const inner = (
              <>
                <PersonAvatar name={r.employee_name} photo={p?.photo_url} className="h-8 w-8" />
                <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{r.employee_name}</span><span className="block truncate text-xs text-muted-foreground">{sub(r)}{r.department_name ? ` · ${r.department_name}` : ''}</span></span>
              </>
            );
            return <li key={r.leave_id}>{admin && onOpen ? <button type="button" onClick={() => onOpen(r.leave_id)} className="flex w-full items-center gap-2.5 rounded-lg text-left hover:bg-muted/50">{inner}</button> : <div className="flex items-center gap-2.5">{inner}</div>}</li>;
          })}
          {rows.length > 8 && <li className="text-xs text-muted-foreground">and {rows.length - 8} more. See the calendar below.</li>}
        </ul>
      )}
    </div>
  );
}
