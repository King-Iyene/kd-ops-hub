import { useState } from 'react';
import { addDays, endOfMonth, endOfYear, format, startOfMonth, startOfWeek, startOfYear, subMonths, subYears } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/** Quick ranges, weeks start on Monday. "All time" starts at the first possible capture. */
export function datePresets(now = new Date()) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastMonth = subMonths(now, 1);
  return [
    { key: 'today', label: 'Today', start: fmt(now), end: fmt(now) },
    { key: 'yesterday', label: 'Yesterday', start: fmt(addDays(now, -1)), end: fmt(addDays(now, -1)) },
    { key: 'week', label: 'This week', start: fmt(weekStart), end: fmt(now) },
    { key: 'lastweek', label: 'Last week', start: fmt(addDays(weekStart, -7)), end: fmt(addDays(weekStart, -1)) },
    { key: 'month', label: 'This month', start: fmt(startOfMonth(now)), end: fmt(now) },
    { key: 'lastmonth', label: 'Last month', start: fmt(startOfMonth(lastMonth)), end: fmt(endOfMonth(lastMonth)) },
    { key: 'year', label: 'This year', start: fmt(startOfYear(now)), end: fmt(now) },
    { key: 'lastyear', label: 'Last year', start: fmt(startOfYear(subYears(now, 1))), end: fmt(endOfYear(subYears(now, 1))) },
    { key: 'all', label: 'All time', start: '2024-01-01', end: fmt(now) },
  ];
}

/**
 * One dropdown for the date range: quick presets plus "Custom range", which reveals the two date
 * boxes right beside it. Used by every Time Tracking page that has a from/to range.
 */
export function DateRangeSelect({
  start, end, setStart, setEnd, className,
}: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void; className?: string }) {
  const presets = datePresets();
  const match = presets.find((p) => p.start === start && p.end === end)?.key;
  const [customOpen, setCustomOpen] = useState(false);
  const value = customOpen || !match ? 'custom' : match;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      <Select
        value={value}
        onValueChange={(k) => {
          if (k === 'custom') { setCustomOpen(true); return; }
          const p = presets.find((x) => x.key === k);
          if (p) { setCustomOpen(false); setStart(p.start); setEnd(p.end); }
        }}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs"><CalendarDays className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" /><SelectValue /></SelectTrigger>
        <SelectContent>
          {presets.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          <SelectItem value="custom">Custom range…</SelectItem>
        </SelectContent>
      </Select>
      {value === 'custom' && (
        <>
          <Input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className="h-8 w-[136px] text-xs" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className="h-8 w-[136px] text-xs" />
        </>
      )}
    </div>
  );
}

/** Single-day version for pages that show one day (Screenshots, Timeline). */
export function DaySelect({ day, setDay }: { day: string; setDay: (v: string) => void }) {
  const today = new Date();
  const quick = [
    { key: fmt(today), label: 'Today' },
    { key: fmt(addDays(today, -1)), label: 'Yesterday' },
    { key: fmt(addDays(today, -2)), label: format(addDays(today, -2), 'EEE d MMM') },
  ];
  const match = quick.find((q) => q.key === day)?.key;
  const [customOpen, setCustomOpen] = useState(false);
  const value = customOpen || !match ? 'custom' : match;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={value} onValueChange={(k) => { if (k === 'custom') setCustomOpen(true); else { setCustomOpen(false); setDay(k); } }}>
        <SelectTrigger className="h-9 w-[150px] text-xs"><CalendarDays className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" /><SelectValue /></SelectTrigger>
        <SelectContent>
          {quick.map((q) => <SelectItem key={q.key} value={q.key}>{q.label}</SelectItem>)}
          <SelectItem value="custom">Pick a date…</SelectItem>
        </SelectContent>
      </Select>
      {value === 'custom' && <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-9 w-40" />}
    </div>
  );
}
