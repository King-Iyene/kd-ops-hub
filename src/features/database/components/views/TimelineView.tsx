import { useState, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';
import { PILL_COLORS } from '../../types';

type Zoom = 'day' | 'week' | 'month';

interface TimelineViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
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

/* ---- component ---- */


const timelineStyles = `
.tl-root {
  --tl-bg: #ffffff;
  --tl-bg-alt: #F9F9FA;
  --tl-border: #E7E7E9;
  --tl-text: #374151;
  --tl-text-muted: #6A7184;
  --tl-text-faint: #9AA2AF;
  --tl-primary: #3366FF;
  --tl-primary-hover: #2952CC;
  --tl-cell-hover: #F3F4F6;
  --tl-tooltip-bg: #1F2937;
  --tl-tooltip-text: #F9FAFB;
  --tl-weekend: #FAFAFA;
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--tl-text);
  font-size: 12px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .tl-root {
    --tl-bg: hsl(200,30%,10%);
    --tl-bg-alt: hsl(200,28%,12%);
    --tl-border: hsl(200,25%,18%);
    --tl-text: hsl(200,25%,88%);
    --tl-text-muted: hsl(200,20%,60%);
    --tl-text-faint: hsl(200,15%,45%);
    --tl-primary: #5588FF;
    --tl-primary-hover: #4477EE;
    --tl-cell-hover: hsl(200,25%,15%);
    --tl-tooltip-bg: hsl(200,20%,22%);
    --tl-tooltip-text: hsl(200,25%,90%);
    --tl-weekend: hsl(200,28%,11%);
  }
}
:root[data-theme="dark"] .tl-root {
  --tl-bg: hsl(200,30%,10%);
  --tl-bg-alt: hsl(200,28%,12%);
  --tl-border: hsl(200,25%,18%);
  --tl-text: hsl(200,25%,88%);
  --tl-text-muted: hsl(200,20%,60%);
  --tl-text-faint: hsl(200,15%,45%);
  --tl-primary: #5588FF;
  --tl-primary-hover: #4477EE;
  --tl-cell-hover: hsl(200,25%,15%);
  --tl-tooltip-bg: hsl(200,20%,22%);
  --tl-tooltip-text: hsl(200,25%,90%);
  --tl-weekend: hsl(200,28%,11%);
}

/* Empty */
.tl-empty {
  display: flex; align-items: center; justify-content: center;
  height: 16rem; color: var(--tl-text-muted); font-size: 14px;
}

/* Config bar */
.tl-config {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--tl-border);
  background: var(--tl-bg-alt); flex-wrap: wrap;
}
.tl-config-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: var(--tl-text-muted);
}
.tl-config-select {
  font-size: 11px; padding: 2px 6px; border-radius: 4px;
  border: 1px solid var(--tl-border); background: var(--tl-bg);
  color: var(--tl-text); outline: none; cursor: pointer;
}
.tl-config-select:focus { border-color: var(--tl-primary); }
.tl-spacer { flex: 1; }
.tl-today-btn {
  padding: 2px 10px; border-radius: 6px;
  border: 1px solid var(--tl-border); background: var(--tl-bg);
  font-size: 11px; font-weight: 500; color: var(--tl-primary); cursor: pointer;
}
.tl-today-btn:hover { background: var(--tl-cell-hover); border-color: var(--tl-primary); }
.tl-zoom-toggle {
  display: flex; border: 1px solid var(--tl-border); border-radius: 6px; overflow: hidden;
}
.tl-zoom-btn {
  padding: 3px 10px; font-size: 11px; font-weight: 500; border: none;
  background: var(--tl-bg); color: var(--tl-text-muted); cursor: pointer;
  border-right: 1px solid var(--tl-border);
}
.tl-zoom-btn:last-child { border-right: none; }
.tl-zoom-btn:hover { background: var(--tl-cell-hover); }
.tl-zoom-btn.active { background: var(--tl-primary); color: #fff; }
.tl-count { font-size: 11px; color: var(--tl-text-faint); }

/* Body layout */
.tl-body {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* Sidebar */
.tl-sidebar {
  flex-shrink: 0; border-right: 1px solid var(--tl-border);
  background: var(--tl-bg); overflow-y: auto; overflow-x: hidden;
}
.tl-sidebar-header {
  display: flex; align-items: flex-end; padding: 0 8px 4px;
  font-size: 11px; font-weight: 600; color: var(--tl-text-muted);
  border-bottom: 1px solid var(--tl-border); background: var(--tl-bg-alt);
  position: sticky; top: 0; z-index: 2; box-sizing: border-box;
}
.tl-sidebar-row {
  display: flex; align-items: center; padding: 0 8px;
  border-bottom: 1px solid var(--tl-border); cursor: pointer; box-sizing: border-box;
}
.tl-sidebar-row:hover { background: var(--tl-cell-hover); }
.tl-sidebar-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 12px; font-weight: 500; color: var(--tl-text);
}

/* Scroll area */
.tl-scroll {
  flex: 1; overflow-x: auto; overflow-y: auto; position: relative;
}
.tl-canvas {
  position: relative;
}

/* Headers */
.tl-month-header {
  position: sticky; top: 0; z-index: 3; display: flex;
}
.tl-month-cell {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; color: var(--tl-text-muted);
  background: var(--tl-bg-alt); border-bottom: 1px solid var(--tl-border);
  border-right: 1px solid var(--tl-border); box-sizing: border-box; height: 100%;
}
.tl-header-row {
  position: sticky; top: 0; z-index: 3; height: 32px;
}
.tl-month-header ~ .tl-header-row { top: 18px; }
.tl-header-cell {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 500; color: var(--tl-text-faint);
  background: var(--tl-bg-alt); border-bottom: 1px solid var(--tl-border);
  border-right: 1px solid var(--tl-border); box-sizing: border-box; height: 100%;
}
.tl-header-cell.today { background: #EBF0FF; color: var(--tl-primary); font-weight: 700; }
:root[data-theme="dark"] .tl-header-cell.today,
:root:not([data-theme="light"]) .tl-header-cell.today { background: hsl(220,50%,20%); }

/* Grid lines */
.tl-grid { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: none; }
.tl-grid-line {
  position: absolute; top: 0; bottom: 0;
  border-right: 1px solid var(--tl-border); box-sizing: border-box;
}
.tl-grid-line.weekend { background: var(--tl-weekend); }
.tl-grid-line-border {
  position: absolute; top: 0; bottom: 0; width: 0;
  border-left: 1px solid var(--tl-border);
}

/* Row stripes */
.tl-row-stripe {
  position: absolute; left: 0; right: 0;
  border-bottom: 1px solid var(--tl-border); box-sizing: border-box;
}
.tl-row-stripe.alt { background: var(--tl-bg-alt); }

/* Today line */
.tl-today-line {
  position: absolute; bottom: 0; width: 2px;
  background: #EF4444; z-index: 4; pointer-events: none;
}

/* Bars */
.tl-bar {
  position: absolute; border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; padding: 0 6px;
  border-left: 3px solid; box-sizing: border-box;
  transition: filter 0.12s; z-index: 2; overflow: hidden;
}
.tl-bar:hover { filter: brightness(0.92); }
.tl-bar-label {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 11px; font-weight: 600;
}

/* Tooltip */
.tl-tooltip {
  position: fixed; z-index: 100;
  background: var(--tl-tooltip-bg); color: var(--tl-tooltip-text);
  border-radius: 8px; padding: 8px 10px; font-size: 11px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-width: 280px; pointer-events: none;
}
.tl-tooltip-row { display: flex; gap: 8px; padding: 2px 0; }
.tl-tooltip-label { font-weight: 600; opacity: 0.6; white-space: nowrap; flex-shrink: 0; }
.tl-tooltip-value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

export default function TimelineView({
  fields,
  records,
  onExpandRow,
}: TimelineViewProps) {
  const [zoom, setZoom] = useState<Zoom>('week');
  const [startDateFieldId, setStartDateFieldId] = useState<string>('');
  const [endDateFieldId, setEndDateFieldId] = useState<string>('');
  const [colorFieldId, setColorFieldId] = useState<string>('');
  const [tooltip, setTooltip] = useState<{ record: RecordRow; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateFields = useMemo(
    () => fields.filter((f) => DATE_TYPES.has(f.ui_type)),
    [fields],
  );

  const selectFields = useMemo(
    () => fields.filter((f) => f.ui_type === 'SingleSelect' && (f.options?.choices?.length ?? 0) > 0),
    [fields],
  );

  // Auto-select first date field if none chosen
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
        // Ensure end >= start
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

  // Determine timeline range
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
    // Add padding
    const rs = addDays(minD, -7);
    const re = addDays(maxD, 14);
    return { rangeStart: rs, rangeEnd: re, totalDays: Math.max(diffDays(rs, re), 14) };
  }, [bars]);

  const colWidth = zoom === 'day' ? 40 : zoom === 'week' ? 20 : 6;
  const totalWidth = totalDays * colWidth;

  // Generate header columns
  const headerCols = useMemo(() => {
    const cols: Array<{ label: string; left: number; width: number; isToday?: boolean }> = [];
    const today = startOfDay(new Date());

    if (zoom === 'day') {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i);
        const label = `${d.getDate()}`;
        cols.push({ label, left: i * colWidth, width: colWidth, isToday: dayKey(d) === dayKey(today) });
      }
    } else if (zoom === 'week') {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i);
        if (d.getDay() === 1 || i === 0) {
          const endOfWeek = addDays(d, 6 - d.getDay());
          const span = Math.min(diffDays(d, endOfWeek) + 1, totalDays - i);
          const label = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
          cols.push({ label, left: i * colWidth, width: span * colWidth });
        }
      }
    } else {
      // month
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

  // Day sub-headers for week/month zoom
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

  // Month header row (shown above day/week zoom)
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

  // Today line position
  const todayOffset = useMemo(() => {
    const today = startOfDay(new Date());
    const off = diffDays(rangeStart, today);
    if (off < 0 || off > totalDays) return null;
    return off * colWidth;
  }, [rangeStart, totalDays, colWidth]);

  const handleBarHover = useCallback((e: React.MouseEvent, record: RecordRow) => {
    setTooltip({ record, x: e.clientX + 8, y: e.clientY - 8 });
  }, []);

  const handleBarLeave = useCallback(() => setTooltip(null), []);

  const handleScrollToToday = useCallback(() => {
    if (todayOffset != null && scrollRef.current) {
      scrollRef.current.scrollLeft = todayOffset - scrollRef.current.clientWidth / 2;
    }
  }, [todayOffset]);

  const ROW_HEIGHT = 36;
  const SIDEBAR_WIDTH = 200;

  // Empty state
  if (dateFields.length === 0) {
    return (
      <div className="tl-root">
        <style>{timelineStyles}</style>
        <div className="tl-empty">
          <p>Add a Date or DateTime field to use Timeline view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tl-root">
      <style>{timelineStyles}</style>

      {/* Config bar */}
      <div className="tl-config">
        <label className="tl-config-label">
          Start
          <select
            className="tl-config-select"
            value={resolvedStartField?.id ?? ''}
            onChange={(e) => setStartDateFieldId(e.target.value)}
          >
            {dateFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label className="tl-config-label">
          End
          <select
            className="tl-config-select"
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
          <label className="tl-config-label">
            Color
            <select
              className="tl-config-select"
              value={resolvedColorField?.id ?? ''}
              onChange={(e) => setColorFieldId(e.target.value)}
            >
              {selectFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="tl-spacer" />
        <button className="tl-today-btn" onClick={handleScrollToToday}>Today</button>
        <div className="tl-zoom-toggle">
          {(['day', 'week', 'month'] as const).map((z) => (
            <button
              key={z}
              className={`tl-zoom-btn${zoom === z ? ' active' : ''}`}
              onClick={() => setZoom(z)}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
        <span className="tl-count">{bars.length} record{bars.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Main area */}
      <div className="tl-body">
        {/* Sidebar */}
        <div className="tl-sidebar" style={{ width: SIDEBAR_WIDTH }}>
          <div className="tl-sidebar-header" style={{ height: zoom === 'month' ? 32 : 50 }}>Name</div>
          {bars.map((b) => (
            <div
              key={b.record.id}
              className="tl-sidebar-row"
              style={{ height: ROW_HEIGHT }}
              onClick={() => onExpandRow?.(b.record)}
            >
              <span className="tl-sidebar-name">{b.title}</span>
            </div>
          ))}
          {bars.length === 0 && (
            <div className="tl-sidebar-row" style={{ height: ROW_HEIGHT, color: 'var(--tl-text-muted)' }}>
              No records with dates
            </div>
          )}
        </div>

        {/* Timeline scroll area */}
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-canvas" style={{ width: totalWidth, minHeight: bars.length * ROW_HEIGHT + (zoom === 'month' ? 32 : 50) }}>
            {/* Month header (for day/week zoom) */}
            {monthHeaders.length > 0 && (
              <div className="tl-month-header" style={{ height: 18 }}>
                {monthHeaders.map((m, i) => (
                  <div
                    key={i}
                    className="tl-month-cell"
                    style={{ left: m.left, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            )}

            {/* Column headers */}
            <div className="tl-header-row" style={{ top: zoom === 'month' ? 0 : 18, height: zoom === 'month' ? 32 : 32 }}>
              {headerCols.map((c, i) => (
                <div
                  key={i}
                  className={`tl-header-cell${c.isToday ? ' today' : ''}`}
                  style={{ left: c.left, width: c.width }}
                >
                  {c.label}
                </div>
              ))}
            </div>

            {/* Grid lines */}
            <div className="tl-grid" style={{ top: zoom === 'month' ? 32 : 50 }}>
              {dayMarkers.map((m, i) => (
                <div
                  key={i}
                  className={`tl-grid-line${m.isWeekend ? ' weekend' : ''}`}
                  style={{ left: m.left, width: colWidth }}
                />
              ))}
              {zoom !== 'day' && headerCols.map((c, i) => (
                <div
                  key={i}
                  className="tl-grid-line-border"
                  style={{ left: c.left }}
                />
              ))}
            </div>

            {/* Row stripes */}
            {bars.map((_, i) => (
              <div
                key={i}
                className={`tl-row-stripe${i % 2 === 1 ? ' alt' : ''}`}
                style={{ top: (zoom === 'month' ? 32 : 50) + i * ROW_HEIGHT, height: ROW_HEIGHT }}
              />
            ))}

            {/* Today line */}
            {todayOffset != null && (
              <div className="tl-today-line" style={{ left: todayOffset, top: zoom === 'month' ? 32 : 50 }} />
            )}

            {/* Bars */}
            {bars.map((b) => {
              const startOff = diffDays(rangeStart, b.start);
              const span = Math.max(diffDays(b.start, b.end), 1);
              const left = startOff * colWidth;
              const width = span * colWidth;
              const idx = bars.indexOf(b);
              const top = (zoom === 'month' ? 32 : 50) + idx * ROW_HEIGHT + 4;
              return (
                <div
                  key={b.record.id}
                  className="tl-bar"
                  style={{
                    left,
                    width: Math.max(width, 8),
                    top,
                    height: ROW_HEIGHT - 8,
                    backgroundColor: b.color.bg,
                    color: b.color.text,
                    borderColor: b.color.text,
                  }}
                  onClick={() => onExpandRow?.(b.record)}
                  onMouseMove={(e) => handleBarHover(e, b.record)}
                  onMouseLeave={handleBarLeave}
                >
                  <span className="tl-bar-label">{b.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="tl-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {titleField && (
            <div className="tl-tooltip-row">
              <span className="tl-tooltip-label">{titleField.name}</span>
              <span className="tl-tooltip-value">{String(tooltip.record[titleField.pg_column_name] ?? '')}</span>
            </div>
          )}
          {resolvedStartField && (
            <div className="tl-tooltip-row">
              <span className="tl-tooltip-label">{resolvedStartField.name}</span>
              <span className="tl-tooltip-value">{String(tooltip.record[resolvedStartField.pg_column_name] ?? '')}</span>
            </div>
          )}
          {resolvedEndField && (
            <div className="tl-tooltip-row">
              <span className="tl-tooltip-label">{resolvedEndField.name}</span>
              <span className="tl-tooltip-value">{String(tooltip.record[resolvedEndField.pg_column_name] ?? '')}</span>
            </div>
          )}
          {resolvedColorField && tooltip.record[resolvedColorField.pg_column_name] && (
            <div className="tl-tooltip-row">
              <span className="tl-tooltip-label">{resolvedColorField.name}</span>
              <span className="tl-tooltip-value">{String(tooltip.record[resolvedColorField.pg_column_name])}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- styles ---- */
