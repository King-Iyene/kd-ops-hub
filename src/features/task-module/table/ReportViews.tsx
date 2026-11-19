import { useMemo } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, EyeOff, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TableField, TableRecordRow } from '@/queries/useTaskModule';
import {
  dayLabel, missingReporters, monthOf, monthsWithReports, rangeLabel, shiftMonth, todayLagos, type ReportRange,
} from './reportDays';

// Week / month / all-reports switch for the grid. Defaults to this week.
export function RangeBar({ range, onChange, records, today }: {
  range: ReportRange; onChange: (r: ReportRange) => void; records: TableRecordRow[]; today: string;
}) {
  const months = useMemo(() => monthsWithReports(records, today), [records, today]);
  const seg = (active: boolean) => cn('h-7 px-2.5 rounded text-xs', active ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground');
  const step = 'h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40';
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-range-bar>
      <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Reports shown">
        <button type="button" aria-pressed={range.kind === 'week'} className={seg(range.kind === 'week')} onClick={() => onChange({ kind: 'week', offset: 0 })}>Week</button>
        <button type="button" aria-pressed={range.kind === 'month'} className={seg(range.kind === 'month')} onClick={() => onChange({ kind: 'month', month: monthOf(today) })}>Month</button>
        <button type="button" aria-pressed={range.kind === 'all'} className={seg(range.kind === 'all')} onClick={() => onChange({ kind: 'all' })}>All reports</button>
      </div>
      {range.kind === 'week' && (
        <>
          <button type="button" className={step} aria-label="Previous week" onClick={() => onChange({ kind: 'week', offset: range.offset - 1 })}><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs font-medium tabular-nums min-w-[9.5rem] text-center" data-range-label>{rangeLabel(range, today)}</span>
          <button type="button" className={step} aria-label="Next week" disabled={range.offset >= 0} onClick={() => onChange({ kind: 'week', offset: range.offset + 1 })}><ChevronRight className="h-4 w-4" /></button>
          {range.offset !== 0 && <button type="button" className="text-2xs text-primary hover:underline" onClick={() => onChange({ kind: 'week', offset: 0 })}>This week</button>}
        </>
      )}
      {range.kind === 'month' && (
        <>
          <button type="button" className={step} aria-label="Previous month" onClick={() => onChange({ kind: 'month', month: shiftMonth(range.month, -1) })}><ChevronLeft className="h-4 w-4" /></button>
          <Select value={range.month} onValueChange={(month) => onChange({ kind: 'month', month })}>
            <SelectTrigger className="h-7 w-40 text-xs" aria-label="Month"><SelectValue>{rangeLabel(range, today)}</SelectValue></SelectTrigger>
            <SelectContent>
              {(months.includes(range.month) ? months : [...months, range.month].sort().reverse()).map((m) => (
                <SelectItem key={m} value={m}>{format(parseISO(`${m}-01`), 'MMMM yyyy')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button type="button" className={step} aria-label="Next month" disabled={range.month >= monthOf(today)} onClick={() => onChange({ kind: 'month', month: shiftMonth(range.month, 1) })}><ChevronRight className="h-4 w-4" /></button>
        </>
      )}
    </div>
  );
}

// The Inbox: for one day, who has not reported yet. A person drops off the
// list the moment their report for that day exists.
export function ReportInbox({ records, personFields, people, day, onDay, skipped, onSkip, onRestore }: {
  records: TableRecordRow[];
  personFields: TableField[];
  people: { id: string; full_name: string; job_title?: string | null }[];
  day: string;
  onDay: (d: string) => void;
  skipped: string[];
  onSkip: (id: string) => void;
  onRestore: () => void;
}) {
  const today = todayLagos();
  const skipSet = useMemo(() => new Set(skipped), [skipped]);
  const missing = useMemo(() => missingReporters(people, records, personFields, day, skipSet), [people, records, personFields, day, skipSet]);
  const expected = people.filter((p) => !skipSet.has(p.id)).length;
  const done = expected - missing.length;
  const weekend = [0, 6].includes(parseISO(day).getDay());
  const shift = (n: number) => onDay(format(addDays(parseISO(day), n), 'yyyy-MM-dd'));
  const step = 'h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40';

  return (
    <div className="space-y-3 max-w-2xl" data-inbox>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" className={step} aria-label="Previous day" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
        <Input type="date" aria-label="Day" value={day} max={today} onChange={(e) => e.target.value && onDay(e.target.value)} className="h-8 w-40 text-xs" />
        <button type="button" className={step} aria-label="Next day" disabled={day >= today} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
        {day !== today && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onDay(today)}>Today</Button>}
        <span className="text-sm font-medium ml-1" data-inbox-day>{dayLabel(day, today)}</span>
      </div>

      <p className="text-xs text-muted-foreground" data-inbox-summary>
        {missing.length === 0 ? 'Everyone has reported.' : `${missing.length} ${missing.length === 1 ? 'person has' : 'people have'} not reported`} · {done} of {expected} reported
      </p>
      {weekend && <p className="text-2xs text-amber-600 dark:text-amber-400">This day is a weekend, so reports may not be expected.</p>}
      {personFields.length === 0 && (
        <p className="text-2xs text-amber-600 dark:text-amber-400">This table has no People question, so reports are matched to whoever added the row.</p>
      )}

      {missing.length === 0 ? (
        <div className="rounded-lg border border-border/70 py-12 flex flex-col items-center gap-2 text-sm text-muted-foreground" data-inbox-empty>
          {expected === 0 ? <CalendarCheck className="h-6 w-6" /> : <PartyPopper className="h-6 w-6 text-emerald-500" />}
          {expected === 0 ? 'Nobody is expected to report.' : 'All caught up — every report for this day is in.'}
        </div>
      ) : (
        <ul className="rounded-lg border border-border/70 divide-y divide-border/50">
          {missing.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2" data-missing={p.full_name}>
              <span className="h-7 w-7 rounded-full bg-muted text-2xs font-semibold inline-flex items-center justify-center shrink-0" aria-hidden>
                {p.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{p.full_name}</span>
                {p.job_title && <span className="block text-2xs text-muted-foreground truncate">{p.job_title}</span>}
              </span>
              <button type="button" onClick={() => onSkip(p.id)} className="text-muted-foreground hover:text-foreground" aria-label={`Don't expect reports from ${p.full_name}`} title="Don't expect reports from this person">
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <p className="text-2xs text-muted-foreground">
          {skipped.length} {skipped.length === 1 ? 'person is' : 'people are'} not expected on this device. <button type="button" className="text-primary hover:underline" onClick={onRestore}>Show them again</button>
        </p>
      )}
    </div>
  );
}
