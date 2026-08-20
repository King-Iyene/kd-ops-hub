import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Task, ProfileRow } from '@/lib/task-types';
import { STATUS_DOT, PRIORITY_BORDER } from '@/lib/task-types';

interface TaskCalendarViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onTaskClick: (task: Task) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TaskCalendarView({ tasks, profiles, onTaskClick }: TaskCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }

    return days;
  }, [year, month]);

  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous month" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next month" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={today}>Today</Button>
        </div>
        <h3 className="text-sm font-semibold">
          {MONTH_NAMES[month]} {year}
        </h3>
        <div className="text-xs text-muted-foreground">
          {tasks.filter((t) => t.due_date).length} tasks with due dates
        </div>
      </div>

      <div className="grid grid-cols-7 border-b">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-r last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {calendarDays.map(({ date, isCurrentMonth }, i) => {
          const key = toDateKey(date);
          const dayTasks = tasksByDate.get(key) || [];
          const isToday = key === todayKey;

          return (
            <div
              key={i}
              className={cn(
                'border-r border-b p-1 min-h-[90px] overflow-hidden',
                !isCurrentMonth && 'bg-muted/30',
                isToday && 'bg-primary/5',
              )}
            >
              <div className={cn(
                'text-[11px] font-medium mb-0.5 text-right pr-0.5',
                isToday ? 'text-primary font-bold' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
              )}>
                {isToday ? (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                    {date.getDate()}
                  </span>
                ) : (
                  date.getDate()
                )}
              </div>

              <div className="space-y-0.5 overflow-y-auto max-h-[70px]">
                {dayTasks.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onTaskClick(t)}
                    className={cn(
                      'w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate border-l-2 transition-colors',
                      'hover:bg-muted/80',
                      PRIORITY_BORDER[t.priority],
                    )}
                  >
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-1 shrink-0', STATUS_DOT[t.status])} />
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 4 && (
                  <p className="text-[9px] text-muted-foreground text-center">
                    +{dayTasks.length - 4} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
