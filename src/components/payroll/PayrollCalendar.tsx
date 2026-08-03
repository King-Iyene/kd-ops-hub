/**
 * PayrollCalendar — a month grid that overlays Nigerian public
 * holidays, payroll-run pay dates and active pay-schedule cutoffs.
 *
 * Designed for the Payroll page's new "Calendar" tab. Operators
 * planning the month can see at a glance which day is a pay day,
 * which day FIRS / Pension submissions fall on, and which dates are
 * holidays that would push a pay date forward / backward (the
 * underlying `next_pay_dates` RPC already handles the holiday roll
 * when the schedule is published).
 *
 * Data sources — all read-only, all selectable via existing RLS:
 *   • public_holidays    (country_code='NG' seed in 20260812200000)
 *   • payroll_runs       (pay_date, period, status)
 *   • pay_schedules      (active monthly / biweekly / weekly anchors —
 *                          used by the next_pay_dates RPC)
 *   • next_pay_dates(schedule_id, count) RPC — gives us the next
 *     N pay dates for an active schedule, holiday-rolled.
 *
 * Visuals:
 *   • Holiday  → red dot, "FIRS holiday — {name}" tooltip
 *   • Pay day  → emerald dot, "Pay day — {period}" tooltip
 *   • Cutoff   → amber dot, "Cutoff — {schedule}" tooltip
 *   • Today    → primary outline (built-in)
 *   • Multiple events on the same day → stacked dots, joined tooltip.
 *
 * The right-side legend lists every event in the visible month so
 * operators don't need to scrub tooltips to plan.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { getNigerianHolidaysInRange, type NgHoliday } from '@/lib/holidays';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  date: string;       // YYYY-MM-DD
  kind: 'holiday' | 'pay_day' | 'cutoff';
  label: string;      // human title
  detail?: string;    // optional secondary text
}

// Roll a date backward over weekends and Nigerian public holidays
// until it lands on a business day. Mirrors the behaviour of the
// next_pay_dates RPC so the client-side fallback feels identical
// once a real schedule is configured. holidays is a Set of yyyy-mm-dd.
function rollBackToBusinessDay(iso: string, holidaySet: Set<string>): { date: string; rolledFrom?: string } {
  let cur = new Date(iso);
  const original = iso;
  let safety = 0;
  while (safety++ < 31) {
    const day = cur.getDay(); // 0 = Sun, 6 = Sat
    const cIso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (day !== 0 && day !== 6 && !holidaySet.has(cIso)) {
      return cIso === original ? { date: cIso } : { date: cIso, rolledFrom: original };
    }
    cur.setDate(cur.getDate() - 1);
  }
  return { date: original };
}

// Generate "Monthly on the Nth" pay days across a date window using
// the same holiday-aware rolling the RPC uses. Used as a smart default
// when the tenant has zero active pay_schedules — operators see what
// payroll *would* look like for the most common Nigerian SME cadence
// (5th of the month) before they finish setting up their schedule.
function generateMonthlyAnchorPayDates(
  startIso: string,
  endIso: string,
  anchorDay: number,
  holidaySet: Set<string>,
): { date: string; rolledFrom?: string }[] {
  const start = new Date(startIso);
  const end   = new Date(endIso);
  const out: { date: string; rolledFrom?: string }[] = [];
  // Walk month-by-month from the start of the window.
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const candidate = new Date(cur.getFullYear(), cur.getMonth(), anchorDay);
    if (candidate >= start && candidate <= end) {
      const iso = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
      out.push(rollBackToBusinessDay(iso, holidaySet));
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// Local-date components, NOT toISOString(). react-day-picker builds each
// grid cell as a local-midnight Date with no timezone info. toISOString()
// converts through UTC, which for any positive-offset timezone (WAT is
// UTC+1) rolls local midnight back to the previous UTC day — every event
// looked up this way keyed one cell earlier than the day it visually sits
// on, so pay-day/cutoff/holiday dots rendered one day off for WAT users.
// Events are keyed by plain yyyy-mm-dd strings straight from the DB with
// no timezone conversion, so the lookup key must be built the same way —
// this mirrors the (correct) isoOf in src/lib/holidays.ts.
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Build a yyyy-mm-dd → events map so the modifier predicate is O(1)
// per render. react-day-picker calls the predicate for every visible
// cell, so this matters on a six-month forward view.
function indexEvents(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const m = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const arr = m.get(e.date) ?? [];
    arr.push(e);
    m.set(e.date, arr);
  }
  return m;
}

const KIND_META: Record<CalendarEvent['kind'], {
  Icon: typeof CalendarDays;
  label: string;
  dot: string;
  pill: string;
}> = {
  holiday: {
    Icon: AlertCircle,
    label: 'Holiday',
    dot: 'bg-red-500',
    pill: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  },
  pay_day: {
    Icon: CheckCircle2,
    label: 'Pay day',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  cutoff: {
    Icon: Clock,
    label: 'Cutoff',
    dot: 'bg-amber-500',
    pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
};

export function PayrollCalendar() {
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // True when the calendar is showing a preview cadence because
  // the tenant hasn't configured an active pay_schedule yet.
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // Fetch a 14-month window centred on the current month so the
      // operator can paginate freely without re-fetching for each
      // month.
      const start = new Date(month.getFullYear(), month.getMonth() - 6, 1);
      const end   = new Date(month.getFullYear(), month.getMonth() + 8, 0);

      // 1. Public holidays — pulled from BOTH a deterministic
      //    client-side generator (covers any year, no seed needed)
      //    AND the public_holidays DB table (admin overrides any
      //    proclamation that shifts a date by ±1 day). The DB row
      //    wins on duplicates so the calendar always reflects the
      //    operator's authoritative copy.
      // 2. Payroll runs — already-issued runs carry a pay_date; older
      //    rows pre-dating the column fall back to the period (rolled
      //    to last day of month for display).
      // 3. Active pay schedules — used to compute upcoming pay dates +
      //    cutoffs via the next_pay_dates RPC. Each active schedule
      //    contributes its anchors and lead days.
      const [hRes, prRes, schedRes] = await Promise.all([
        supabase.from('public_holidays')
          .select('holiday_date, name')
          .eq('country_code', 'NG')
          .gte('holiday_date', isoOf(start))
          .lte('holiday_date', isoOf(end)),
        supabase.from('payroll_runs')
          .select('id, period, status, pay_date, cutoff_date')
          .gte('period', start.toISOString().slice(0, 7))
          .lte('period', end.toISOString().slice(0, 7))
          .order('period', { ascending: true }),
        supabase.from('pay_schedules')
          .select('id, name')
          .eq('is_active', true),
      ]);

      const out: CalendarEvent[] = [];

      // Algorithmic holidays — covers every year deterministically.
      const computed: NgHoliday[] = getNigerianHolidaysInRange(isoOf(start), isoOf(end));
      const dbDates = new Set((hRes.data ?? []).map((r: any) => r.holiday_date));
      for (const h of computed) {
        if (dbDates.has(h.date)) continue; // DB override beats computed
        out.push({
          date: h.date,
          kind: 'holiday',
          label: h.name + (h.exact ? '' : ' (estimated)'),
          detail: h.category === 'islamic'
            ? 'Islamic holiday — exact civil date depends on lunar sighting'
            : h.category === 'christian'
              ? 'Christian holiday — Gregorian computus'
              : 'Public holiday (Nigeria)',
        });
      }

      // DB-overridden holidays
      for (const h of (hRes.data ?? []) as any[]) {
        out.push({
          date: h.holiday_date,
          kind: 'holiday',
          label: h.name,
          detail: 'Public holiday (Nigeria)',
        });
      }

      // Past + scheduled payroll runs
      for (const r of (prRes.data ?? []) as any[]) {
        const periodLabel = monthName(r.period);
        if (r.pay_date) {
          out.push({
            date: r.pay_date,
            kind: 'pay_day',
            label: `Pay day · ${periodLabel}`,
            detail: `Payroll run status: ${r.status}`,
          });
        }
        if (r.cutoff_date) {
          out.push({
            date: r.cutoff_date,
            kind: 'cutoff',
            label: `Cutoff · ${periodLabel}`,
            detail: 'Last day to add overtime / variable pay',
          });
        }
      }

      // Upcoming pay dates from each active schedule (next 6 events).
      // The RPC handles holiday-rolling so dates landing on a Sunday
      // or holiday already get bumped to the previous business day.
      // Errors are silenced — if the RPC isn't deployed on a tenant
      // the calendar still shows holidays + past runs.
      for (const s of (schedRes.data ?? []) as any[]) {
        try {
          const { data: pdRows } = await supabase.rpc('next_pay_dates', {
            p_schedule_id: s.id,
            p_count: 6,
          });
          for (const row of (pdRows ?? []) as any[]) {
            // Avoid duplicating a date we already added from
            // payroll_runs (the RPC will return the same date the
            // run was scheduled on).
            const payDateExists = out.some((e) =>
              e.date === row.pay_date && e.kind === 'pay_day',
            );
            if (!payDateExists) {
              const detail = row.adjusted_from && row.adjusted_from !== row.pay_date
                ? `Upcoming · rolled from ${formatDate(row.adjusted_from)}${row.holiday_name ? ` (${row.holiday_name})` : ''}`
                : 'Upcoming pay day';
              out.push({
                date: row.pay_date,
                kind: 'pay_day',
                label: `Pay day · ${s.name}`,
                detail,
              });
            }
            // Cutoff for the same pay period — typically a few days
            // before the pay date depending on processing_lead_days.
            if (row.cutoff_date) {
              const cutoffExists = out.some((e) =>
                e.date === row.cutoff_date && e.kind === 'cutoff',
              );
              if (!cutoffExists) {
                out.push({
                  date: row.cutoff_date,
                  kind: 'cutoff',
                  label: `Cutoff · ${s.name}`,
                  detail: 'Last day to add overtime / variable pay',
                });
              }
            }
          }
        } catch {
          /* RPC missing → skip this schedule */
        }
      }

      // ── Fallback: no active schedules → preview the most common
      // Nigerian SME cadence so the calendar isn't empty while the
      // operator finishes their setup. We surface 5th-of-the-month
      // pay days, holiday-rolled to the previous business day, plus
      // a cutoff three business days before each pay day. The banner
      // below the calendar makes the fallback nature explicit so the
      // operator doesn't think these are real, configured runs.
      const hasActiveSchedule = (schedRes.data ?? []).length > 0;
      const hasAnyPayDay      = out.some((e) => e.kind === 'pay_day');
      if (!hasActiveSchedule && !hasAnyPayDay) {
        const holidaySet = new Set<string>();
        for (const e of out) if (e.kind === 'holiday') holidaySet.add(e.date);
        const previewDates = generateMonthlyAnchorPayDates(isoOf(start), isoOf(end), 5, holidaySet);
        for (const p of previewDates) {
          out.push({
            date: p.date,
            kind: 'pay_day',
            label: 'Pay day · Default (5th)',
            detail: p.rolledFrom
              ? `Preview · rolled from ${formatDate(p.rolledFrom)} (weekend / holiday)`
              : 'Preview · set up a real schedule under Pay Schedules',
          });
          // Cutoff three business days before — same rolling logic so
          // it lands on a working day too.
          const cutoffCand = new Date(p.date);
          cutoffCand.setDate(cutoffCand.getDate() - 3);
          const cutoffIso = `${cutoffCand.getFullYear()}-${String(cutoffCand.getMonth() + 1).padStart(2, '0')}-${String(cutoffCand.getDate()).padStart(2, '0')}`;
          const cutoff = rollBackToBusinessDay(cutoffIso, holidaySet);
          out.push({
            date: cutoff.date,
            kind: 'cutoff',
            label: 'Cutoff · Default',
            detail: 'Lock overtime + variable pay before this date',
          });
        }
      }

      if (!cancelled) {
        setEvents(out);
        setIsPreview(!hasActiveSchedule && !hasAnyPayDay);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month.getFullYear(), month.getMonth()]);

  const eventMap = useMemo(() => indexEvents(events), [events]);

  // react-day-picker modifier predicates — they get a Date and we
  // hand back a boolean.
  const modifiers = useMemo(() => ({
    holiday: (d: Date) => (eventMap.get(isoOf(d)) ?? []).some((e) => e.kind === 'holiday'),
    payDay:  (d: Date) => (eventMap.get(isoOf(d)) ?? []).some((e) => e.kind === 'pay_day'),
    cutoff:  (d: Date) => (eventMap.get(isoOf(d)) ?? []).some((e) => e.kind === 'cutoff'),
  }), [eventMap]);

  const modifiersClassNames = {
    holiday: 'kd-cal-holiday',
    payDay:  'kd-cal-payday',
    cutoff:  'kd-cal-cutoff',
  };

  // Events visible in the active month — for the right-side list.
  const monthEvents = useMemo(() => {
    const ym = month.toISOString().slice(0, 7);
    return events
      .filter((e) => e.date.startsWith(ym))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, month]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" /> Payroll calendar
          <InfoHint>
            A month-by-month plan of what's coming up. <b>Pay days</b> are
            when salaries hit employee accounts. <b>Cutoffs</b> are the
            last day to lock in overtime, bonuses or any variable pay
            for that month — anything entered after a cutoff lands on
            next month's run. <b>Holidays</b> are Nigerian public days;
            if a pay day falls on one, the schedule rolls it to the
            previous business day automatically.
          </InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Preview banner — surfaces only while no active schedule
            exists. Tells the operator what they're looking at and
            points at the Pay Schedules tab where they apply a real
            preset. Dismissed automatically the moment a schedule is
            saved (state will go isPreview=false on next refresh). */}
        {isPreview && (
          <div className="mx-4 mt-4 mb-0 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p className="leading-snug">
              <span className="font-semibold">Preview cadence —</span>{' '}
              showing 5th-of-the-month pay days as a default. Set up a
              real <span className="font-medium">Pay Schedule</span> to
              replace this with your actual cadence and unlock auto pay
              date computation.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(260px,360px)] gap-4 p-4">

          {/* Calendar */}
          <div className="rounded-xl border bg-card p-2">
            {/* Inline overrides so the holiday / pay-day / cutoff
                modifiers paint distinct dot underlines without
                fighting the existing day-selected / day-today
                styles. */}
            <style>{`
              .kd-cal-holiday::after,
              .kd-cal-payday::after,
              .kd-cal-cutoff::after {
                content: '';
                position: absolute;
                bottom: 4px;
                left: 50%;
                transform: translateX(-50%);
                height: 4px;
                width: 4px;
                border-radius: 9999px;
              }
              .kd-cal-holiday { color: hsl(var(--destructive)); font-weight: 600; }
              .kd-cal-holiday::after { background: hsl(var(--destructive)); }
              .kd-cal-payday  { color: rgb(5 150 105); font-weight: 600; }
              .kd-cal-payday::after  { background: rgb(5 150 105); }
              .kd-cal-cutoff  { color: rgb(217 119 6); font-weight: 600; }
              .kd-cal-cutoff::after  { background: rgb(217 119 6); }
              .kd-cal-payday.kd-cal-holiday::after {
                /* If both fall on the same date the pay-date dot wins;
                   the holiday tooltip still surfaces in the legend. */
                background: rgb(5 150 105);
              }
            `}</style>
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              showOutsideDays
              className="mx-auto"
            />
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-[11px] text-muted-foreground border-t mt-2">
              <LegendDot className="bg-emerald-500" label="Pay day" />
              <LegendDot className="bg-amber-500"   label="Cutoff" />
              <LegendDot className="bg-red-500"     label="Holiday" />
              <span className="ml-auto text-[10px] text-muted-foreground/70">
                Nigerian public holidays · auto-rolled by next_pay_dates
              </span>
            </div>
          </div>

          {/* Right column — list view of the visible month */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-2 max-h-[420px] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {month.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
              <Badge variant="outline" className="text-[10px]">
                {monthEvents.length} event{monthEvents.length === 1 ? '' : 's'}
              </Badge>
            </div>
            {loading ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
            ) : monthEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No holidays, pay dates or cutoffs this month.
              </p>
            ) : (
              monthEvents.map((e, i) => {
                const meta = KIND_META[e.kind];
                return (
                  <div key={`${e.date}-${e.kind}-${i}`} className="flex items-start gap-2 rounded-lg bg-background border border-border/60 px-2.5 py-2">
                    <div className={cn('mt-0.5 flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset', meta.pill)}>
                      <meta.Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{e.label}</p>
                        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDate(e.date)}
                        </span>
                      </div>
                      {e.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{e.detail}</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

// Tiny labelled legend dot used under the calendar.
function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', className)} />
      {label}
    </span>
  );
}

function monthName(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }
  return period;
}
