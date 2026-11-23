import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  getTimezone,
  orgToday,
  orgWallClockToUtcIso,
  utcIsoToOrgWallClock,
} from '@/lib/format';
import {
  formatYMD,
  parseTypedDate,
  parseYMD,
  splitWallClock,
  to12h,
  to24h,
  type YMD,
} from '../../lib/dateInput';
import { formatDbDate, formatDbDateTime } from '../../lib/dates';

/**
 * Editor for Date and Date & Time cells.
 *
 * - The cell keeps showing its value while the picker is open (nothing goes blank).
 * - A box at the top lets you type the date ("22 Nov", "22/11/2026", "tomorrow").
 * - Choosing a day in a date-only field saves and closes; a date-time field waits for Done.
 * - Times are the workspace timezone, stated in the footer.
 */

interface DateEditorProps {
  value: unknown;
  mode: 'date' | 'datetime';
  /** false shows a 24 hour clock; anything else shows 12 hour with AM/PM. */
  use12h?: boolean;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
}

function toDay(ymd: YMD): Date {
  return new Date(ymd.year, ymd.month - 1, ymd.day, 12);
}
function fromDay(d: Date): YMD {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}
function todayYMD(): YMD {
  return parseYMD(orgToday()) ?? fromDay(new Date());
}
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Day, hour and minute held by an existing value (workspace timezone). */
function readValue(value: unknown, mode: 'date' | 'datetime') {
  if (typeof value !== 'string' || !value) return { day: null as YMD | null, hour24: 12, minute: 0 };
  if (mode === 'datetime') {
    try {
      const parts = splitWallClock(utcIsoToOrgWallClock(value));
      if (parts) return { day: parts.date, hour24: parts.hour24, minute: parts.minute };
    } catch {
      /* fall through */
    }
  }
  const plain = parseYMD(value);
  if (plain) return { day: plain, hour24: 12, minute: 0 };
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? { day: null as YMD | null, hour24: 12, minute: 0 }
    : { day: fromDay(d), hour24: 12, minute: 0 };
}

const CALENDAR_CLASSES = {
  months: 'flex flex-col',
  month: 'space-y-3',
  caption: 'flex justify-center pt-0.5 relative items-center h-8',
  caption_label: 'text-sm font-semibold tracking-tight',
  nav_button:
    'h-7 w-7 inline-flex items-center justify-center rounded-md bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-2 focus-visible:ring-primary/40',
  head_cell: 'text-muted-foreground w-9 text-[0.7rem] font-medium uppercase tracking-wide',
  row: 'flex w-full mt-1',
  cell: 'h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
  day: 'relative h-9 w-9 rounded-md p-0 text-sm font-normal inline-flex items-center justify-center hover:bg-muted transition-colors aria-selected:opacity-100 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-2 focus-visible:ring-primary/40',
  day_selected:
    'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
  day_today:
    'font-semibold text-primary after:absolute after:bottom-[5px] after:left-1/2 after:h-[3px] after:w-[3px] after:-translate-x-1/2 after:rounded-full after:bg-current aria-selected:text-primary-foreground',
  day_outside: 'text-muted-foreground/50 aria-selected:bg-primary/60 aria-selected:text-primary-foreground',
  day_disabled: 'text-muted-foreground/40',
} as const;

export function DateEditor({ value, mode, use12h = true, onCommit, onCancel }: DateEditorProps) {
  const initial = useMemo(() => readValue(value, mode), [value, mode]);
  const tz = getTimezone();

  const [day, setDay] = useState<YMD | null>(initial.day);
  const [month, setMonth] = useState<Date>(() => toDay(initial.day ?? todayYMD()));
  const [text, setText] = useState(() => (initial.day ? formatDbDate(formatYMD(initial.day)) : ''));
  const [typedError, setTypedError] = useState(false);
  const [hour24, setHour24] = useState(initial.hour24);
  const [minute, setMinute] = useState(initial.minute);
  const typedRef = useRef<HTMLInputElement>(null);

  const shownValue = useMemo(() => {
    if (typeof value !== 'string' || !value) return '';
    return mode === 'datetime' ? formatDbDateTime(value, tz) : formatDbDate(value, tz);
  }, [value, mode, tz]);

  const save = useCallback(
    (d: YMD | null, h24: number, min: number) => {
      if (!d) {
        onCommit(null);
        return;
      }
      if (mode === 'date') {
        onCommit(formatYMD(d));
        return;
      }
      onCommit(orgWallClockToUtcIso(`${formatYMD(d)}T${pad2(h24)}:${pad2(min)}`));
    },
    [mode, onCommit],
  );

  // Ctrl+; puts in today (and now, for a date-time field).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ';') {
        e.preventDefault();
        const parts = splitWallClock(utcIsoToOrgWallClock(new Date().toISOString()));
        save(todayYMD(), parts?.hour24 ?? 12, parts?.minute ?? 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  const chooseDay = (next: YMD) => {
    setDay(next);
    setMonth(toDay(next));
    setText(formatDbDate(formatYMD(next)));
    setTypedError(false);
  };

  const applyTyped = () => {
    if (text.trim() === '') {
      save(null, hour24, minute);
      return;
    }
    const parsed = parseTypedDate(text, todayYMD());
    if (!parsed) {
      setTypedError(true);
      return;
    }
    chooseDay(parsed);
    if (mode === 'date') save(parsed, hour24, minute);
  };

  const setNow = () => {
    const parts = splitWallClock(utcIsoToOrgWallClock(new Date().toISOString()));
    const today = todayYMD();
    const h = parts?.hour24 ?? 12;
    const m = parts?.minute ?? 0;
    chooseDay(today);
    setHour24(h);
    setMinute(m);
    save(today, h, m);
  };

  const hour12 = to12h(hour24);

  return (
    <Popover open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <PopoverTrigger asChild>
        <div className="flex items-center w-full h-full min-w-0" aria-label="Date being edited">
          <span className="truncate text-[13px] tabular-nums text-foreground">{shownValue}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={2}
        collisionPadding={12}
        className="w-[300px] p-0 rounded-xl border border-border bg-popover shadow-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          typedRef.current?.focus();
          typedRef.current?.select();
        }}
      >
        <div className="p-3 pb-0">
          <input
            ref={typedRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setTypedError(false); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); applyTyped(); }
              if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }}
            placeholder="Type a date, like 22 Nov or tomorrow"
            aria-label="Type a date"
            aria-invalid={typedError}
            className={cn(
              'kd-flat-input h-8 w-full rounded-md border bg-background px-2.5 text-sm tabular-nums placeholder:text-muted-foreground/60',
              typedError ? 'border-destructive' : 'border-border',
            )}
          />
          {typedError && (
            <p className="mt-1 text-xs text-destructive">That is not a date. Try 22 Nov 2026 or 22/11/2026.</p>
          )}
        </div>

        <Calendar
          mode="single"
          selected={day ? toDay(day) : undefined}
          month={month}
          onMonthChange={setMonth}
          onSelect={(picked) => {
            if (!picked) return;
            const next = fromDay(picked);
            chooseDay(next);
            if (mode === 'date') save(next, hour24, minute);
          }}
          weekStartsOn={1}
          classNames={CALENDAR_CLASSES}
          className="px-3 py-3"
        />

        {mode === 'datetime' && (
          <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">Time</span>
            <input
              aria-label="Hour"
              inputMode="numeric"
              value={use12h ? String(hour12.hour) : pad2(hour24)}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                if (Number.isNaN(n)) return;
                if (use12h) {
                  if (n >= 1 && n <= 12) setHour24(to24h(n, hour12.period));
                } else if (n >= 0 && n <= 23) {
                  setHour24(n);
                }
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'ArrowUp') { e.preventDefault(); setHour24((h) => (h + 1) % 24); }
                if (e.key === 'ArrowDown') { e.preventDefault(); setHour24((h) => (h + 23) % 24); }
                if (e.key === 'Enter') save(day, hour24, minute);
              }}
              className="kd-flat-input h-8 w-11 rounded-md border border-border bg-background text-center text-sm tabular-nums"
            />
            <span className="text-muted-foreground">:</span>
            <input
              aria-label="Minute"
              inputMode="numeric"
              value={pad2(minute)}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, '').slice(-2), 10);
                if (!Number.isNaN(n) && n >= 0 && n <= 59) setMinute(n);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'ArrowUp') { e.preventDefault(); setMinute((m) => (m + 1) % 60); }
                if (e.key === 'ArrowDown') { e.preventDefault(); setMinute((m) => (m + 59) % 60); }
                if (e.key === 'Enter') save(day, hour24, minute);
              }}
              className="kd-flat-input h-8 w-11 rounded-md border border-border bg-background text-center text-sm tabular-nums"
            />
            {use12h && (
              <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="AM or PM">
                {(['AM', 'PM'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={hour12.period === p}
                    onClick={() => setHour24(to24h(hour12.hour, p))}
                    className={cn(
                      'h-8 px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
                      hour12.period === p ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => onCommit(null)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Clear
          </button>
          {mode === 'datetime' && <span className="truncate text-[11px] text-muted-foreground" title={tz}>Times in {tz}</span>}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (mode === 'datetime') setNow();
                else {
                  const t = todayYMD();
                  chooseDay(t);
                  save(t, hour24, minute);
                }
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {mode === 'datetime' ? 'Now' : 'Today'}
            </button>
            {mode === 'datetime' && (
              <button
                type="button"
                onClick={() => save(day, hour24, minute)}
                disabled={!day}
                className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

