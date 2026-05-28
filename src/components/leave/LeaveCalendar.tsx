// Team leave calendar — month grid showing who's out (or about to be).
//
// Data source: leave_calendar_v view (Sprint C migration) — includes
// approved + pending leave requests. Pending entries render with reduced
// opacity so managers can spot "not yet decided" overlaps.
//
// Honours leave_type with the same colour map as the rest of the Leave page.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type LeaveType = 'annual' | 'sick' | 'unpaid' | 'maternity' | 'paternity';

interface CalendarRow {
  leave_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: 'approved' | 'pending';
}

const TYPE_DOT: Record<LeaveType, string> = {
  annual: 'bg-info',
  sick: 'bg-destructive',
  unpaid: 'bg-muted-foreground',
  maternity: 'bg-pink-500',
  paternity: 'bg-violet-500',
};

const monthLabel = (d: Date) =>
  d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

const isoDay = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// Build the visible 6×7 cell grid for a given month — Monday-start, fills
// adjacent days for visual continuity (same convention as the WHO's-off
// calendars in Workday / HiBob).
const buildGrid = (month: Date): Date[] => {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  // Monday=0, Sunday=6 — shift so the grid starts on Monday.
  const startDow = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - startDow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return d;
  });
};

export default function LeaveCalendar() {
  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const monthStart = isoDay(month);
    const monthEnd = isoDay(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)));
    setLoading(true);
    supabase
      .from('leave_calendar_v')
      .select('leave_id, employee_id, employee_name, department_name, leave_type, start_date, end_date, status')
      // Any leave whose window overlaps the visible month
      .lte('start_date', monthEnd)
      .gte('end_date', monthStart)
      .then(({ data }) => {
        setRows((data as CalendarRow[]) || []);
        setLoading(false);
      });
  }, [month]);

  const grid = useMemo(() => buildGrid(month), [month]);

  // Bucket rows by ISO day for fast cell rendering.
  const rowsByDay = useMemo(() => {
    const map = new Map<string, CalendarRow[]>();
    for (const r of rows) {
      const a = new Date(`${r.start_date}T00:00:00Z`);
      const b = new Date(`${r.end_date}T00:00:00Z`);
      const cur = new Date(a);
      while (cur.getTime() <= b.getTime()) {
        const key = isoDay(cur);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    return map;
  }, [rows]);

  const today = isoDay(new Date());
  const monthIdx = month.getUTCMonth();

  return (
    <Card className="rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{monthLabel(month)}</h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const now = new Date();
              setMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
            }}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {(Object.entries(TYPE_DOT) as [LeaveType, string][]).map(([type, cls]) => (
          <span key={type} className="flex items-center gap-1.5 capitalize">
            <span className={cn('h-2 w-2 rounded-full', cls)} />
            {type}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="h-2 w-2 rounded-full border border-dashed border-muted-foreground" />
          pending
        </span>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-1 py-1 text-center">{d}</div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading calendar…
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d, i) => {
            const key = isoDay(d);
            const cell = rowsByDay.get(key) || [];
            const inMonth = d.getUTCMonth() === monthIdx;
            const isToday = key === today;
            const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            return (
              <div
                key={i}
                className={cn(
                  'min-h-[78px] rounded-md border p-1.5 text-[11px] overflow-hidden',
                  inMonth ? 'bg-card' : 'bg-muted/20 opacity-60',
                  weekend && 'bg-muted/30',
                  isToday && 'ring-2 ring-primary',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('font-semibold tabular-nums', !inMonth && 'text-muted-foreground')}>
                    {d.getUTCDate()}
                  </span>
                  {cell.length > 0 && (
                    <span className="text-[9px] font-medium text-muted-foreground">
                      {cell.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {cell.slice(0, 3).map((r) => (
                    <div
                      key={r.leave_id + key}
                      className={cn(
                        'flex items-center gap-1 truncate',
                        r.status === 'pending' && 'opacity-60',
                      )}
                      title={`${r.employee_name} · ${r.leave_type}${r.status === 'pending' ? ' (pending)' : ''}`}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', TYPE_DOT[r.leave_type])} />
                      <span className="truncate">{r.employee_name.split(' ')[0]}</span>
                    </div>
                  ))}
                  {cell.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{cell.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No approved or pending leave overlapping this month.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="text-[11px] text-muted-foreground flex justify-between border-t pt-2">
          <span>Showing {rows.length} leave window{rows.length === 1 ? '' : 's'}</span>
          <Badge variant="outline" className="text-[10px]">Source: leave_calendar_v</Badge>
        </div>
      )}
    </Card>
  );
}
