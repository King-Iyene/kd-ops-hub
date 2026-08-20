import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Task, ProfileRow, TaskDependency } from '@/lib/task-types';
import { STATUS_DOT, PRIORITY_BORDER } from '@/lib/task-types';

interface TaskGanttViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onTaskClick: (task: Task) => void;
  dependencies?: TaskDependency[];
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

export function TaskGanttView({ tasks, profiles, onTaskClick, dependencies = [] }: TaskGanttViewProps) {
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

  const depArrows = useMemo(() => {
    if (!dependencies.length || !ganttTasks.length) return [];

    const taskIndexMap = new Map<string, number>();
    ganttTasks.forEach((t, i) => taskIndexMap.set(t.id, i));

    type ArrowInfo = {
      key: string;
      srcX: number;
      srcY: number;
      tgtX: number;
      tgtY: number;
      dashed: boolean;
    };

    const arrows: ArrowInfo[] = [];

    for (const dep of dependencies) {
      if (dep.dependency_type === 'duplicate_of') continue;

      let blockerId: string;
      let blockedId: string;
      const dashed = dep.dependency_type === 'relates_to';

      if (dep.dependency_type === 'blocks') {
        blockerId = dep.task_id;
        blockedId = dep.depends_on_id;
      } else if (dep.dependency_type === 'is_blocked_by') {
        blockerId = dep.depends_on_id;
        blockedId = dep.task_id;
      } else {
        // relates_to: arbitrary direction, use task_id -> depends_on_id
        blockerId = dep.task_id;
        blockedId = dep.depends_on_id;
      }

      const srcIdx = taskIndexMap.get(blockerId);
      const tgtIdx = taskIndexMap.get(blockedId);
      if (srcIdx === undefined || tgtIdx === undefined) continue;

      const srcTask = ganttTasks[srcIdx];
      const tgtTask = ganttTasks[tgtIdx];

      // Compute source bar end X
      const srcStartDate = new Date(srcTask.start_date || srcTask.due_date!);
      const srcEndDate = new Date(srcTask.due_date || srcTask.start_date!);
      const srcStartDay = daysBetween(viewStart, srcStartDate);
      const srcDuration = Math.max(1, daysBetween(srcStartDate, srcEndDate) + 1);
      const srcClippedStart = Math.max(0, srcStartDay);
      const srcClippedEnd = Math.min(totalDays, srcStartDay + srcDuration);
      const srcLeft = Math.max(0, srcStartDay) * DAY_WIDTH;
      const srcWidth = Math.max(DAY_WIDTH, (srcClippedEnd - srcClippedStart) * DAY_WIDTH);
      const srcEndX = srcLeft + srcWidth;

      // Compute target bar start X
      const tgtStartDate = new Date(tgtTask.start_date || tgtTask.due_date!);
      const tgtStartDay = daysBetween(viewStart, tgtStartDate);
      const tgtLeft = Math.max(0, tgtStartDay) * DAY_WIDTH;

      // Y centers: each row is 32px, bar is vertically centered
      const srcY = srcIdx * 32 + 16;
      const tgtY = tgtIdx * 32 + 16;

      arrows.push({
        key: dep.id,
        srcX: srcEndX,
        srcY,
        tgtX: tgtLeft,
        tgtY,
        dashed,
      });
    }

    return arrows;
  }, [dependencies, ganttTasks, viewStart, totalDays]);

  const todayOffset = daysBetween(viewStart, today);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous period" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next period" onClick={next}>
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
              {depArrows.length > 0 && (
                <svg
                  className="absolute inset-0 pointer-events-none text-muted-foreground"
                  style={{
                    width: totalDays * DAY_WIDTH,
                    height: ganttTasks.length * 32,
                    zIndex: 20,
                  }}
                >
                  <defs>
                    <marker
                      id="gantt-arrowhead"
                      markerWidth="8"
                      markerHeight="6"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L8,3 L0,6 Z" fill="currentColor" />
                    </marker>
                    <marker
                      id="gantt-arrowhead-dashed"
                      markerWidth="8"
                      markerHeight="6"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L8,3 L0,6 Z" fill="currentColor" />
                    </marker>
                  </defs>
                  {depArrows.map((a) => {
                    const dx = a.tgtX - a.srcX;
                    const cpOffset = Math.max(20, Math.abs(dx) * 0.3);
                    const d = `M ${a.srcX},${a.srcY} C ${a.srcX + cpOffset},${a.srcY} ${a.tgtX - cpOffset},${a.tgtY} ${a.tgtX},${a.tgtY}`;
                    return (
                      <path
                        key={a.key}
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeDasharray={a.dashed ? '4 3' : undefined}
                        markerEnd={a.dashed ? 'url(#gantt-arrowhead-dashed)' : 'url(#gantt-arrowhead)'}
                      />
                    );
                  })}
                </svg>
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
                    {isVisible && t.task_type === 'milestone' ? (
                      <button
                        onClick={() => onTaskClick(t)}
                        className="absolute top-1 flex items-center gap-1 group/ms"
                        style={{ left: left + width / 2 - 10 }}
                      >
                        <div
                          className={cn(
                            'h-5 w-5 rotate-45 rounded-sm transition-colors',
                            t.status === 'complete' ? 'bg-green-500' :
                            t.status === 'blocked' ? 'bg-red-500' :
                            t.status === 'in_progress' ? 'bg-blue-500' :
                            'bg-amber-500',
                          )}
                        />
                        <span className="text-[9px] font-medium text-muted-foreground whitespace-nowrap -rotate-0 ml-1 group-hover/ms:text-foreground">
                          {t.title}
                        </span>
                      </button>
                    ) : isVisible && (
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
