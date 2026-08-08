import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Task, ProfileRow } from '@/lib/task-types';
import { STATUS_DOT, PRIORITY_BORDER } from '@/lib/task-types';

interface TaskGanttViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onTaskClick: (task: Task) => void;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_WIDTH = 32;

export function TaskGanttView({ tasks, profiles, onTaskClick }: TaskGanttViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const totalDays = 60;
  const viewEnd = addDays(viewStart, totalDays);
  const today = new Date();
  const todayStr = toDateStr(today);

  const ganttTasks = useMemo(() => {
    return tasks
      .filter((t) => t.due_date || t.start_date)
      .sort((a, b) => {
        const aStart = a.start_date || a.due_date || '';
        const bStart = b.start_date || b.due_date || '';
        return aStart.localeCompare(bStart);
      });
  }, [tasks]);

  const prev = () => setViewStart((d) => addDays(d, -14));
  const next = () => setViewStart((d) => addDays(d, 14));
  const goToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    setViewStart(d);
  };

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < totalDays; i++) arr.push(addDays(viewStart, i));
    return arr;
  }, [viewStart]);

  const months = useMemo(() => {
    const result: { label: string; span: number }[] = [];
    let currentLabel = '';
    let currentSpan = 0;
    for (const d of days) {
      const label = d.toLocaleDateString('en', { month: 'short', year: 'numeric' });
      if (label !== currentLabel) {
        if (currentLabel) result.push({ label: currentLabel, span: currentSpan });
        currentLabel = label;
        currentSpan = 1;
      } else {
        currentSpan++;
      }
    }
    if (currentLabel) result.push({ label: currentLabel, span: currentSpan });
    return result;
  }, [days]);

  const todayOffset = daysBetween(viewStart, today);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToday}>Today</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {ganttTasks.length} tasks with dates
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Task labels */}
        <div className="w-[200px] shrink-0 border-r overflow-y-auto">
          <div className="h-[52px] border-b bg-muted/30 flex items-end px-2 pb-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Task</span>
          </div>
          {ganttTasks.map((t) => (
            <button
              key={t.id}
              onClick={() => onTaskClick(t)}
              className="flex items-center gap-2 w-full px-2 py-1.5 border-b text-left hover:bg-muted/50 transition-colors"
              style={{ height: 32 }}
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[t.status])} />
              <span className="text-xs truncate">{t.title}</span>
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-auto" ref={scrollRef}>
          <div style={{ width: totalDays * DAY_WIDTH, minHeight: '100%' }}>
            {/* Month headers */}
            <div className="flex h-[26px] border-b bg-muted/30">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="text-[10px] font-semibold text-muted-foreground border-r flex items-center px-1"
                  style={{ width: m.span * DAY_WIDTH }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Day headers */}
            <div className="flex h-[26px] border-b">
              {days.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isToday = toDateStr(d) === todayStr;
                return (
                  <div
                    key={i}
                    className={cn(
                      'text-[9px] text-center border-r flex items-center justify-center',
                      isWeekend && 'bg-muted/40',
                      isToday && 'bg-primary/10 font-bold text-primary',
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    {d.getDate()}
                  </div>
                );
              })}
            </div>

            {/* Task bars */}
            <div className="relative">
              {todayOffset >= 0 && todayOffset < totalDays && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-primary/60 z-10"
                  style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                />
              )}
              {ganttTasks.map((t) => {
                const startDate = new Date(t.start_date || t.due_date!);
                const endDate = new Date(t.due_date || t.start_date!);
                const startDay = daysBetween(viewStart, startDate);
                const duration = Math.max(1, daysBetween(startDate, endDate) + 1);
                const left = Math.max(0, startDay) * DAY_WIDTH;
                const clippedStart = Math.max(0, startDay);
                const clippedEnd = Math.min(totalDays, startDay + duration);
                const width = Math.max(DAY_WIDTH, (clippedEnd - clippedStart) * DAY_WIDTH);
                const isVisible = startDay + duration > 0 && startDay < totalDays;

                return (
                  <div key={t.id} className="relative border-b" style={{ height: 32 }}>
                    {/* Weekend stripes */}
                    {days.map((d, i) => (
                      (d.getDay() === 0 || d.getDay() === 6) && (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 bg-muted/30"
                          style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                        />
                      )
                    ))}
                    {isVisible && (
                      <button
                        onClick={() => onTaskClick(t)}
                        className={cn(
                          'absolute top-1 h-6 rounded text-[9px] text-white font-medium px-1.5 truncate transition-colors hover:opacity-80',
                          t.status === 'complete' ? 'bg-green-500' :
                          t.status === 'blocked' ? 'bg-red-500' :
                          t.status === 'in_progress' ? 'bg-blue-500' :
                          'bg-slate-400',
                        )}
                        style={{ left, width }}
                      >
                        {t.title}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
