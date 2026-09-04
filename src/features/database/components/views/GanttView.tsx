import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { FieldMeta, RecordRow } from '../../types';
import { PILL_COLORS } from '../../types';

type Zoom = 'day' | 'week' | 'month';

interface GanttViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onExpandRow?: (record: RecordRow) => void;
}

/* ---- helpers ---- */

const DATE_TYPES = new Set(['Date', 'DateTime', 'CreatedTime', 'LastModifiedTime']);

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getBarColor(
  record: RecordRow,
  colorField: FieldMeta | undefined,
): { bg: string; text: string } {
  const fallback = PILL_COLORS[0];
  if (!colorField) return fallback;
  const val = record[colorField.pg_column_name];
  if (!val) return fallback;
  const choice = colorField.options?.choices?.find((c) => c.title === val);
  if (!choice) return fallback;
  return PILL_COLORS.find((p) => p.name === choice.color) ?? fallback;
}

/* ---- styles ---- */

const ganttStyles = `
.gantt-root {
  --g-bg: #ffffff;
  --g-bg-alt: #F9F9FA;
  --g-border: #E5E5E5;
  --g-text: #374151;
  --g-text-muted: #6A7184;
  --g-text-faint: #9AA2AF;
  --g-primary: #166EE1;
  --g-primary-hover: #2952CC;
  --g-cell-hover: #F3F4F6;
  --g-tooltip-bg: #1F2937;
  --g-tooltip-text: #F9FAFB;
  --g-weekend: #FAFAFA;
  --g-handle: rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  color: var(--g-text);
  font-size: 12px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .gantt-root {
    --g-bg: hsl(200,30%,10%);
    --g-bg-alt: hsl(200,28%,12%);
    --g-border: hsl(200,25%,18%);
    --g-text: hsl(200,25%,88%);
    --g-text-muted: hsl(200,20%,60%);
    --g-text-faint: hsl(200,15%,45%);
    --g-primary: #5588FF;
    --g-primary-hover: #4477EE;
    --g-cell-hover: hsl(200,25%,15%);
    --g-tooltip-bg: hsl(200,20%,22%);
    --g-tooltip-text: hsl(200,25%,90%);
    --g-weekend: hsl(200,28%,11%);
    --g-handle: rgba(255,255,255,0.3);
  }
}
:root[data-theme="dark"] .gantt-root {
  --g-bg: hsl(200,30%,10%);
  --g-bg-alt: hsl(200,28%,12%);
  --g-border: hsl(200,25%,18%);
  --g-text: hsl(200,25%,88%);
  --g-text-muted: hsl(200,20%,60%);
  --g-text-faint: hsl(200,15%,45%);
  --g-primary: #5588FF;
  --g-primary-hover: #4477EE;
  --g-cell-hover: hsl(200,25%,15%);
  --g-tooltip-bg: hsl(200,20%,22%);
  --g-tooltip-text: hsl(200,25%,90%);
  --g-weekend: hsl(200,28%,11%);
  --g-handle: rgba(255,255,255,0.3);
}

.gantt-empty {
  display: flex; align-items: center; justify-content: center;
  height: 16rem; color: var(--g-text-muted); font-size: 14px;
}

.gantt-config {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--g-border);
  background: var(--g-bg-alt); flex-wrap: wrap;
}
.gantt-config-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: var(--g-text-muted);
}
.gantt-config-select {
  font-size: 11px; padding: 2px 6px; border-radius: 4px;
  border: 1px solid var(--g-border); background: var(--g-bg);
  color: var(--g-text); outline: none; cursor: pointer;
}
.gantt-config-select:focus { border-color: var(--g-primary); }
.gantt-spacer { flex: 1; }
.gantt-today-btn {
  padding: 2px 10px; border-radius: 6px;
  border: 1px solid var(--g-border); background: var(--g-bg);
  font-size: 11px; font-weight: 500; color: var(--g-primary); cursor: pointer;
}
.gantt-today-btn:hover { background: var(--g-cell-hover); border-color: var(--g-primary); }
.gantt-zoom-toggle {
  display: flex; border: 1px solid var(--g-border); border-radius: 6px; overflow: hidden;
}
.gantt-zoom-btn {
  padding: 3px 10px; font-size: 11px; font-weight: 500; border: none;
  background: var(--g-bg); color: var(--g-text-muted); cursor: pointer;
  border-right: 1px solid var(--g-border);
}
.gantt-zoom-btn:last-child { border-right: none; }
.gantt-zoom-btn:hover { background: var(--g-cell-hover); }
.gantt-zoom-btn.active { background: var(--g-primary); color: #fff; }
.gantt-count { font-size: 11px; color: var(--g-text-faint); }

.gantt-body {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

.gantt-sidebar {
  flex-shrink: 0; border-right: 1px solid var(--g-border);
  background: var(--g-bg); overflow-y: hidden; overflow-x: hidden;
}
.gantt-sidebar-header {
  display: flex; align-items: flex-end; padding: 0 8px 4px;
  font-size: 11px; font-weight: 600; color: var(--g-text-muted);
  border-bottom: 1px solid var(--g-border); background: var(--g-bg-alt);
  position: sticky; top: 0; z-index: 2; box-sizing: border-box;
}
.gantt-sidebar-scroll {
  overflow-y: auto; overflow-x: hidden;
}
.gantt-sidebar-row {
  display: flex; align-items: center; padding: 0 8px;
  border-bottom: 1px solid var(--g-border); cursor: pointer; box-sizing: border-box;
}
.gantt-sidebar-row:hover { background: var(--g-cell-hover); }
.gantt-sidebar-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 12px; font-weight: 500; color: var(--g-text);
}

.gantt-scroll {
  flex: 1; overflow-x: auto; overflow-y: auto; position: relative;
}
.gantt-canvas {
  position: relative;
}

.gantt-month-header {
  position: sticky; top: 0; z-index: 3; display: flex;
}
.gantt-month-cell {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; color: var(--g-text-muted);
  background: var(--g-bg-alt); border-bottom: 1px solid var(--g-border);
  border-right: 1px solid var(--g-border); box-sizing: border-box; height: 100%;
}
.gantt-header-row {
  position: sticky; top: 0; z-index: 3; height: 32px;
}
.gantt-month-header ~ .gantt-header-row { top: 18px; }
.gantt-header-cell {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 500; color: var(--g-text-faint);
  background: var(--g-bg-alt); border-bottom: 1px solid var(--g-border);
  border-right: 1px solid var(--g-border); box-sizing: border-box; height: 100%;
}
.gantt-header-cell.today { background: #EBF0FF; color: var(--g-primary); font-weight: 700; }
:root[data-theme="dark"] .gantt-header-cell.today,
:root:not([data-theme="light"]) .gantt-header-cell.today { background: hsl(220,50%,20%); }

.gantt-grid { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: none; }
.gantt-grid-line {
  position: absolute; top: 0; bottom: 0;
  border-right: 1px solid var(--g-border); box-sizing: border-box;
}
.gantt-grid-line.weekend { background: var(--g-weekend); }
.gantt-grid-line-border {
  position: absolute; top: 0; bottom: 0; width: 0;
  border-left: 1px solid var(--g-border);
}

.gantt-row-stripe {
  position: absolute; left: 0; right: 0;
  border-bottom: 1px solid var(--g-border); box-sizing: border-box;
}
.gantt-row-stripe.alt { background: var(--g-bg-alt); }

.gantt-today-line {
  position: absolute; bottom: 0; width: 2px;
  background: #EF4444; z-index: 4; pointer-events: none;
}

.gantt-bar {
  position: absolute; border-radius: 6px; cursor: grab;
  display: flex; align-items: center; padding: 0 10px;
  border-left: 3px solid; box-sizing: border-box;
  transition: filter 0.12s; z-index: 2; overflow: hidden;
  user-select: none;
}
.gantt-bar:hover { filter: brightness(0.92); }
.gantt-bar.dragging { cursor: grabbing; opacity: 0.85; z-index: 10; }
.gantt-bar-label {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 11px; font-weight: 600; pointer-events: none;
}

.gantt-handle {
  position: absolute; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 3;
}
.gantt-handle::after {
  content: ''; position: absolute; top: 50%; transform: translateY(-50%);
  width: 3px; height: 14px; border-radius: 2px; background: var(--g-handle);
}
.gantt-handle-left { left: 0; }
.gantt-handle-left::after { left: 2px; }
.gantt-handle-right { right: 0; }
.gantt-handle-right::after { right: 2px; }

.gantt-tooltip {
  position: fixed; z-index: 100;
  background: var(--g-tooltip-bg); color: var(--g-tooltip-text);
  border-radius: 8px; padding: 8px 10px; font-size: 11px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-width: 280px; pointer-events: none;
}
.gantt-tooltip-row { display: flex; gap: 8px; padding: 2px 0; }
.gantt-tooltip-label { font-weight: 600; opacity: 0.6; white-space: nowrap; flex-shrink: 0; }
.gantt-tooltip-value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

/* ---- component ---- */

interface DragState {
  recordId: string;
  mode: 'move' | 'resize-start' | 'resize-end';
  startX: number;
  origStart: Date;
  origEnd: Date;
}

function GanttSkeleton() {
  return (
    <div className="gantt-root">
      <style>{ganttStyles}</style>
      <div className="flex items-center gap-3 px-3 h-9 border-b border-[var(--g-border,#E5E5E5)]">
        <div className="h-3 w-32 rounded animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="shrink-0 border-r border-[var(--g-border,#E5E5E5)] p-2 space-y-3" style={{ width: 200 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-28 rounded animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]" />
          ))}
        </div>
        <div className="flex-1 p-3 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-5 rounded animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]"
              style={{ width: `${20 + ((i * 37) % 50)}%`, marginLeft: `${(i * 13) % 30}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GanttView({
  fields,
  records,
  isLoading,
  onCellUpdate,
  onExpandRow,
}: GanttViewProps) {
  const [zoom, setZoom] = useState<Zoom>('week');
  const [startDateFieldId, setStartDateFieldId] = useState<string>('');
  const [endDateFieldId, setEndDateFieldId] = useState<string>('');
  const [colorFieldId, setColorFieldId] = useState<string>('');
  const [tooltip, setTooltip] = useState<{ record: RecordRow; x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const didDragRef = useRef(false);
  const [dragDelta, setDragDelta] = useState(0);
  const dragDeltaRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  const dateFields = useMemo(
    () => fields.filter((f) => DATE_TYPES.has(f.ui_type)),
    [fields],
  );

  const editableDateFields = useMemo(
    () => dateFields.filter((f) => f.ui_type === 'Date' || f.ui_type === 'DateTime'),
    [dateFields],
  );

  const selectFields = useMemo(
    () => fields.filter((f) => f.ui_type === 'SingleSelect' && (f.options?.choices?.length ?? 0) > 0),
    [fields],
  );

  const resolvedStartField = useMemo(
    () => dateFields.find((f) => f.id === startDateFieldId) ?? dateFields[0],
    [dateFields, startDateFieldId],
  );

  const resolvedEndField = useMemo(
    () => dateFields.find((f) => f.id === endDateFieldId) ?? undefined,
    [dateFields, endDateFieldId],
  );

  const resolvedColorField = useMemo(
    () => selectFields.find((f) => f.id === colorFieldId) ?? selectFields[0] ?? undefined,
    [selectFields, colorFieldId],
  );

  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const canDrag = useMemo(() => {
    const startEditable = resolvedStartField && editableDateFields.some((f) => f.id === resolvedStartField.id);
    return !!startEditable;
  }, [resolvedStartField, editableDateFields]);

  const canResizeEnd = useMemo(() => {
    return !!resolvedEndField && editableDateFields.some((f) => f.id === resolvedEndField.id);
  }, [resolvedEndField, editableDateFields]);

  // Process records into bars
  const bars = useMemo(() => {
    if (!resolvedStartField) return [];
    return records
      .map((r) => {
        const start = toDate(r[resolvedStartField.pg_column_name]);
        if (!start) return null;
        let end: Date | null = null;
        if (resolvedEndField) {
          end = toDate(r[resolvedEndField.pg_column_name]);
        }
        if (!end) end = addDays(start, 1);
        if (end < start) end = addDays(start, 1);
        const title = titleField ? String(r[titleField.pg_column_name] ?? '') : r.id;
        const color = getBarColor(r, resolvedColorField);
        return { record: r, start: startOfDay(start), end: startOfDay(end), title, color };
      })
      .filter(Boolean) as Array<{
        record: RecordRow;
        start: Date;
        end: Date;
        title: string;
        color: { bg: string; text: string };
      }>;
  }, [records, resolvedStartField, resolvedEndField, resolvedColorField, titleField]);

  // Timeline range
  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (bars.length === 0) {
      const today = startOfDay(new Date());
      const rs = addDays(today, -14);
      const re = addDays(today, 28);
      return { rangeStart: rs, rangeEnd: re, totalDays: diffDays(rs, re) };
    }
    let minD = bars[0].start;
    let maxD = bars[0].end;
    for (const b of bars) {
      if (b.start < minD) minD = b.start;
      if (b.end > maxD) maxD = b.end;
    }
    const rs = addDays(minD, -7);
    const re = addDays(maxD, 14);
    return { rangeStart: rs, rangeEnd: re, totalDays: Math.max(diffDays(rs, re), 14) };
  }, [bars]);

  const colWidth = zoom === 'day' ? 40 : zoom === 'week' ? 20 : 6;
  const totalWidth = totalDays * colWidth;
  const ROW_HEIGHT = 36;
  const SIDEBAR_WIDTH = 200;
  const headerHeight = zoom === 'month' ? 32 : 50;

  // Header columns
  const headerCols = useMemo(() => {
    const cols: Array<{ label: string; left: number; width: number; isToday?: boolean }> = [];
    const today = startOfDay(new Date());

    if (zoom === 'day') {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i);
        cols.push({ label: `${d.getDate()}`, left: i * colWidth, width: colWidth, isToday: dayKey(d) === dayKey(today) });
      }
    } else if (zoom === 'week') {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i);
        if (d.getDay() === 1 || i === 0) {
          const endOfWeek = addDays(d, 6 - d.getDay());
          const span = Math.min(diffDays(d, endOfWeek) + 1, totalDays - i);
          cols.push({ label: `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`, left: i * colWidth, width: span * colWidth });
        }
      }
    } else {
      let i = 0;
      while (i < totalDays) {
        const d = addDays(rangeStart, i);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const daysLeft = diffDays(d, monthEnd) + 1;
        const span = Math.min(daysLeft, totalDays - i);
        cols.push({
          label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
          left: i * colWidth,
          width: span * colWidth,
        });
        i += span;
      }
    }
    return cols;
  }, [zoom, totalDays, rangeStart, colWidth]);

  const dayMarkers = useMemo(() => {
    if (zoom !== 'day') return [];
    const today = startOfDay(new Date());
    const markers: Array<{ left: number; isToday: boolean; isWeekend: boolean }> = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      markers.push({
        left: i * colWidth,
        isToday: dayKey(d) === dayKey(today),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }
    return markers;
  }, [zoom, totalDays, rangeStart, colWidth]);

  const monthHeaders = useMemo(() => {
    if (zoom === 'month') return [];
    const result: Array<{ label: string; left: number; width: number }> = [];
    let i = 0;
    while (i < totalDays) {
      const d = addDays(rangeStart, i);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const daysLeft = diffDays(d, monthEnd) + 1;
      const span = Math.min(daysLeft, totalDays - i);
      result.push({
        label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        left: i * colWidth,
        width: span * colWidth,
      });
      i += span;
    }
    return result;
  }, [zoom, totalDays, rangeStart, colWidth]);

  const todayOffset = useMemo(() => {
    const today = startOfDay(new Date());
    const off = diffDays(rangeStart, today);
    if (off < 0 || off > totalDays) return null;
    return off * colWidth;
  }, [rangeStart, totalDays, colWidth]);

  // Scroll sync: timeline vertical scroll drives sidebar scroll
  const handleTimelineScroll = useCallback(() => {
    if (scrollRef.current && sidebarScrollRef.current) {
      sidebarScrollRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  }, []);

  const handleSidebarScroll = useCallback(() => {
    if (scrollRef.current && sidebarScrollRef.current) {
      scrollRef.current.scrollTop = sidebarScrollRef.current.scrollTop;
    }
  }, []);

  const handleScrollToToday = useCallback(() => {
    if (todayOffset != null && scrollRef.current) {
      scrollRef.current.scrollLeft = todayOffset - scrollRef.current.clientWidth / 2;
    }
  }, [todayOffset]);

  // Drag logic
  const handleDragStart = useCallback(
    (e: React.MouseEvent, recordId: string, mode: DragState['mode'], barStart: Date, barEnd: Date) => {
      e.stopPropagation();
      e.preventDefault();
      setDragState({ recordId, mode, startX: e.clientX, origStart: barStart, origEnd: barEnd });
      didDragRef.current = true;
      dragDeltaRef.current = 0;
      setDragDelta(0);
      setTooltip(null);
    },
    [],
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      dragDeltaRef.current = dx;
      setDragDelta(dx);
    };

    const handleMouseUp = () => {
      const daysDelta = Math.round(dragDeltaRef.current / colWidth);
      if (daysDelta !== 0 && resolvedStartField) {
        const bar = bars.find((b) => b.record.id === dragState.recordId);
        if (bar) {
          if (dragState.mode === 'move') {
            const newStart = addDays(dragState.origStart, daysDelta);
            onCellUpdate(dragState.recordId, resolvedStartField.id, formatDate(newStart));
            if (resolvedEndField) {
              const newEnd = addDays(dragState.origEnd, daysDelta);
              onCellUpdate(dragState.recordId, resolvedEndField.id, formatDate(newEnd));
            }
          } else if (dragState.mode === 'resize-start') {
            const newStart = addDays(dragState.origStart, daysDelta);
            if (newStart < dragState.origEnd) {
              onCellUpdate(dragState.recordId, resolvedStartField.id, formatDate(newStart));
            }
          } else if (dragState.mode === 'resize-end' && resolvedEndField) {
            const newEnd = addDays(dragState.origEnd, daysDelta);
            if (newEnd > dragState.origStart) {
              onCellUpdate(dragState.recordId, resolvedEndField.id, formatDate(newEnd));
            }
          }
        }
      }
      setDragState(null);
      setDragDelta(0);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, colWidth, bars, resolvedStartField, resolvedEndField, onCellUpdate]);

  const handleBarHover = useCallback((e: React.MouseEvent, record: RecordRow) => {
    if (dragState) return;
    setTooltip({ record, x: e.clientX + 8, y: e.clientY - 8 });
  }, [dragState]);

  const handleBarLeave = useCallback(() => setTooltip(null), []);

  // Compute dragged bar positions
  const getBarPosition = useCallback(
    (b: { record: RecordRow; start: Date; end: Date }) => {
      let barStart = b.start;
      let barEnd = b.end;

      if (dragState && dragState.recordId === b.record.id) {
        const daysDelta = Math.round(dragDelta / colWidth);
        if (dragState.mode === 'move') {
          barStart = addDays(dragState.origStart, daysDelta);
          barEnd = addDays(dragState.origEnd, daysDelta);
        } else if (dragState.mode === 'resize-start') {
          const newStart = addDays(dragState.origStart, daysDelta);
          if (newStart < dragState.origEnd) barStart = newStart;
        } else if (dragState.mode === 'resize-end') {
          const newEnd = addDays(dragState.origEnd, daysDelta);
          if (newEnd > dragState.origStart) barEnd = newEnd;
        }
      }

      const startOff = diffDays(rangeStart, barStart);
      const span = Math.max(diffDays(barStart, barEnd), 1);
      return { left: startOff * colWidth, width: span * colWidth };
    },
    [dragState, dragDelta, colWidth, rangeStart],
  );

  if (isLoading && records.length === 0) {
    return <GanttSkeleton />;
  }

  // Empty state
  if (dateFields.length === 0) {
    return (
      <div className="gantt-root">
        <style>{ganttStyles}</style>
        <div className="gantt-empty">
          <p>Add a Date or DateTime field to use Gantt view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gantt-root">
      <style>{ganttStyles}</style>

      {/* Config bar */}
      <div className="gantt-config">
        <label className="gantt-config-label">
          Start
          <select
            className="gantt-config-select"
            value={resolvedStartField?.id ?? ''}
            onChange={(e) => setStartDateFieldId(e.target.value)}
          >
            {dateFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label className="gantt-config-label">
          End
          <select
            className="gantt-config-select"
            value={resolvedEndField?.id ?? ''}
            onChange={(e) => setEndDateFieldId(e.target.value)}
          >
            <option value="">(none - 1 day)</option>
            {dateFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        {selectFields.length > 0 && (
          <label className="gantt-config-label">
            Color
            <select
              className="gantt-config-select"
              value={resolvedColorField?.id ?? ''}
              onChange={(e) => setColorFieldId(e.target.value)}
            >
              {selectFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="gantt-spacer" />
        <button className="gantt-today-btn" onClick={handleScrollToToday}>Today</button>
        <div className="gantt-zoom-toggle">
          {(['day', 'week', 'month'] as const).map((z) => (
            <button
              key={z}
              className={`gantt-zoom-btn${zoom === z ? ' active' : ''}`}
              onClick={() => setZoom(z)}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
        <span className="gantt-count">{bars.length} record{bars.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Main area */}
      <div className="gantt-body">
        {/* Sidebar */}
        <div className="gantt-sidebar" style={{ width: SIDEBAR_WIDTH }}>
          <div className="gantt-sidebar-header" style={{ height: headerHeight }}>Name</div>
          <div
            className="gantt-sidebar-scroll"
            ref={sidebarScrollRef}
            onScroll={handleSidebarScroll}
            style={{ height: `calc(100% - ${headerHeight}px)` }}
          >
            {bars.map((b) => (
              <div
                key={b.record.id}
                className="gantt-sidebar-row"
                style={{ height: ROW_HEIGHT }}
                onClick={() => onExpandRow?.(b.record)}
              >
                <span className="gantt-sidebar-name">{b.title}</span>
              </div>
            ))}
            {bars.length === 0 && (
              <div className="gantt-sidebar-row" style={{ height: ROW_HEIGHT, color: 'var(--g-text-muted)' }}>
                No records with dates
              </div>
            )}
          </div>
        </div>

        {/* Timeline scroll area */}
        <div className="gantt-scroll" ref={scrollRef} onScroll={handleTimelineScroll}>
          <div className="gantt-canvas" style={{ width: totalWidth, minHeight: bars.length * ROW_HEIGHT + headerHeight }}>
            {/* Month header (for day/week zoom) */}
            {monthHeaders.length > 0 && (
              <div className="gantt-month-header" style={{ height: 18 }}>
                {monthHeaders.map((m, i) => (
                  <div key={i} className="gantt-month-cell" style={{ left: m.left, width: m.width }}>
                    {m.label}
                  </div>
                ))}
              </div>
            )}

            {/* Column headers */}
            <div className="gantt-header-row" style={{ top: zoom === 'month' ? 0 : 18, height: 32 }}>
              {headerCols.map((c, i) => (
                <div
                  key={i}
                  className={`gantt-header-cell${c.isToday ? ' today' : ''}`}
                  style={{ left: c.left, width: c.width }}
                >
                  {c.label}
                </div>
              ))}
            </div>

            {/* Grid lines */}
            <div className="gantt-grid" style={{ top: headerHeight }}>
              {dayMarkers.map((m, i) => (
                <div
                  key={i}
                  className={`gantt-grid-line${m.isWeekend ? ' weekend' : ''}`}
                  style={{ left: m.left, width: colWidth }}
                />
              ))}
              {zoom !== 'day' && headerCols.map((c, i) => (
                <div key={i} className="gantt-grid-line-border" style={{ left: c.left }} />
              ))}
            </div>

            {/* Row stripes */}
            {bars.map((_, i) => (
              <div
                key={i}
                className={`gantt-row-stripe${i % 2 === 1 ? ' alt' : ''}`}
                style={{ top: headerHeight + i * ROW_HEIGHT, height: ROW_HEIGHT }}
              />
            ))}

            {/* Today line */}
            {todayOffset != null && (
              <div className="gantt-today-line" style={{ left: todayOffset, top: headerHeight }} />
            )}

            {/* Bars */}
            {bars.map((b, idx) => {
              const pos = getBarPosition(b);
              const top = headerHeight + idx * ROW_HEIGHT + 4;
              const isDragging = dragState?.recordId === b.record.id;
              return (
                <div
                  key={b.record.id}
                  className={`gantt-bar${isDragging ? ' dragging' : ''}`}
                  style={{
                    left: pos.left,
                    width: Math.max(pos.width, 8),
                    top,
                    height: ROW_HEIGHT - 8,
                    backgroundColor: b.color.bg,
                    color: b.color.text,
                    borderColor: b.color.text,
                  }}
                  onMouseDown={canDrag ? (e) => handleDragStart(e, b.record.id, 'move', b.start, b.end) : undefined}
                  onClick={() => {
                    if (didDragRef.current) { didDragRef.current = false; return; }
                    onExpandRow?.(b.record);
                  }}
                  onMouseMove={(e) => handleBarHover(e, b.record)}
                  onMouseLeave={handleBarLeave}
                >
                  {/* Left resize handle */}
                  {canDrag && (
                    <div
                      className="gantt-handle gantt-handle-left"
                      onMouseDown={(e) => handleDragStart(e, b.record.id, 'resize-start', b.start, b.end)}
                    />
                  )}
                  <span className="gantt-bar-label">{b.title}</span>
                  {/* Right resize handle */}
                  {canResizeEnd && (
                    <div
                      className="gantt-handle gantt-handle-right"
                      onMouseDown={(e) => handleDragStart(e, b.record.id, 'resize-end', b.start, b.end)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && !dragState && (
        <div className="gantt-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {titleField && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">{titleField.name}</span>
              <span className="gantt-tooltip-value">{String(tooltip.record[titleField.pg_column_name] ?? '')}</span>
            </div>
          )}
          {resolvedStartField && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">{resolvedStartField.name}</span>
              <span className="gantt-tooltip-value">{String(tooltip.record[resolvedStartField.pg_column_name] ?? '')}</span>
            </div>
          )}
          {resolvedEndField && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">{resolvedEndField.name}</span>
              <span className="gantt-tooltip-value">{String(tooltip.record[resolvedEndField.pg_column_name] ?? '')}</span>
            </div>
          )}
          {resolvedColorField && tooltip.record[resolvedColorField.pg_column_name] && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">{resolvedColorField.name}</span>
              <span className="gantt-tooltip-value">{String(tooltip.record[resolvedColorField.pg_column_name])}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
