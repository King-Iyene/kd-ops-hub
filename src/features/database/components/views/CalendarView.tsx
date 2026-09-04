import { useState, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, GripVertical } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';
import { PILL_COLORS } from '../../types';

type ViewMode = 'month' | 'week' | 'day';

interface CalendarViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onExpandRow?: (record: RecordRow) => void;
  onAddRow: (record?: Record<string, any>) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8am-8pm

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const result = new Date(d);
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getEventColor(
  record: RecordRow,
  colorField: FieldMeta | undefined,
): { bg: string; text: string; darkBg: string; darkText: string } {
  const defaultColor = { bg: '#EBF0FF', text: '#166EE1', darkBg: 'hsl(220,50%,20%)', darkText: 'hsl(220,80%,75%)' };
  if (!colorField) return defaultColor;
  const val = record[colorField.pg_column_name];
  if (!val) return defaultColor;
  const choice = colorField.options?.choices?.find((c) => c.title === val);
  if (!choice) return defaultColor;
  const pill = PILL_COLORS.find((p) => p.name === choice.color) ?? PILL_COLORS[0];
  // Derive a dark-mode variant by darkening bg and lightening text
  return { bg: pill.bg, text: pill.text, darkBg: pill.bg + '33', darkText: pill.text };
}

// ---------- Mini Calendar ----------
function MiniCalendar({
  currentDate,
  onSelectDate,
}: {
  currentDate: Date;
  onSelectDate: (d: Date) => void;
}) {
  const [month, setMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  const today = new Date();

  const cells = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= lastDate; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [month]);

  return (
    <div className="calendar-mini">
      <div className="calendar-mini-header">
        <button
          className="calendar-mini-nav"
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
        >
          <ChevronLeft size={12} />
        </button>
        <span className="calendar-mini-title">
          {month.toLocaleString('default', { month: 'short', year: 'numeric' })}
        </span>
        <button
          className="calendar-mini-nav"
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        >
          <ChevronRight size={12} />
        </button>
      </div>
      <div className="calendar-mini-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="calendar-mini-day-label">{d}</div>
        ))}
        {cells.map((day, i) => {
          const isToday =
            day !== null &&
            today.getDate() === day &&
            today.getMonth() === month.getMonth() &&
            today.getFullYear() === month.getFullYear();
          const isSelected =
            day !== null &&
            currentDate.getDate() === day &&
            currentDate.getMonth() === month.getMonth() &&
            currentDate.getFullYear() === month.getFullYear();
          return (
            <button
              key={i}
              className={`calendar-mini-cell${isToday ? ' mini-today' : ''}${isSelected ? ' mini-selected' : ''}`}
              disabled={day === null}
              onClick={() => {
                if (day !== null) {
                  onSelectDate(new Date(month.getFullYear(), month.getMonth(), day));
                }
              }}
            >
              {day ?? ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Event Tooltip ----------
function EventTooltip({
  record,
  fields,
  x,
  y,
}: {
  record: RecordRow;
  fields: FieldMeta[];
  x: number;
  y: number;
}) {
  const visibleFields = fields.filter((f) => !f.is_system && !f.is_hidden).slice(0, 5);
  return (
    <div className="calendar-tooltip" style={{ left: x, top: y }}>
      {visibleFields.map((f) => {
        const val = record[f.pg_column_name];
        if (val == null || val === '') return null;
        return (
          <div key={f.id} className="calendar-tooltip-row">
            <span className="calendar-tooltip-label">{f.name}</span>
            <span className="calendar-tooltip-value">{String(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Calendar Event Item ----------
function CalendarEvent({
  record,
  titleField,
  secondaryField,
  colorField,
  fields,
  compact,
  onExpandRow,
}: {
  record: RecordRow;
  titleField: FieldMeta | undefined;
  secondaryField: FieldMeta | undefined;
  colorField: FieldMeta | undefined;
  fields: FieldMeta[];
  compact?: boolean;
  onExpandRow?: (record: RecordRow) => void;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const colors = getEventColor(record, colorField);
  const title = titleField ? String(record[titleField.pg_column_name] ?? '') : record.id;
  const secondary = secondaryField ? String(record[secondaryField.pg_column_name] ?? '') : '';

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ x: rect.right + 4, y: rect.top });
  };

  return (
    <>
      <div
        ref={ref}
        className={`calendar-event${compact ? ' compact' : ''}`}
        style={{
          '--event-bg': colors.bg,
          '--event-text': colors.text,
          '--event-dark-bg': colors.darkBg,
          '--event-dark-text': colors.darkText,
        } as React.CSSProperties}
        onClick={() => onExpandRow?.(record)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setTooltip(null)}
      >
        <div className="calendar-event-resize-handle top" />
        <span className="calendar-event-title">{title}</span>
        {!compact && secondary && (
          <span className="calendar-event-secondary">{secondary}</span>
        )}
        <div className="calendar-event-resize-handle bottom">
          <GripVertical size={8} />
        </div>
      </div>
      {tooltip && <EventTooltip record={record} fields={fields} x={tooltip.x} y={tooltip.y} />}
    </>
  );
}



// ---------- Styles ----------
const calendarStyles = `
/* ===== Light theme tokens (default) ===== */
.calendar-root {
  --cal-bg: #ffffff;
  --cal-bg-alt: #F9F9FA;
  --cal-border: #E5E5E5;
  --cal-text: #374151;
  --cal-text-muted: #6A7184;
  --cal-text-faint: #9AA2AF;
  --cal-primary: #166EE1;
  --cal-primary-hover: #2952CC;
  --cal-primary-light: #EBF0FF;
  --cal-primary-light-hover: #D6E0FF;
  --cal-today-bg: #FAFBFF;
  --cal-cell-hover: #F3F4F6;
  --cal-tooltip-bg: #1F2937;
  --cal-tooltip-text: #F9FAFB;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  color: var(--cal-text);
  font-size: 13px;
}

/* ===== Dark theme ===== */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .calendar-root {
    --cal-bg: hsl(200, 30%, 10%);
    --cal-bg-alt: hsl(200, 28%, 12%);
    --cal-border: hsl(200, 25%, 18%);
    --cal-text: hsl(200, 25%, 88%);
    --cal-text-muted: hsl(200, 20%, 60%);
    --cal-text-faint: hsl(200, 15%, 45%);
    --cal-primary: #5588FF;
    --cal-primary-hover: #4477EE;
    --cal-primary-light: hsl(220, 50%, 20%);
    --cal-primary-light-hover: hsl(220, 50%, 25%);
    --cal-today-bg: hsl(220, 40%, 14%);
    --cal-cell-hover: hsl(200, 25%, 15%);
    --cal-tooltip-bg: hsl(200, 20%, 22%);
    --cal-tooltip-text: hsl(200, 25%, 90%);
  }
}
:root[data-theme="dark"] .calendar-root {
  --cal-bg: hsl(200, 30%, 10%);
  --cal-bg-alt: hsl(200, 28%, 12%);
  --cal-border: hsl(200, 25%, 18%);
  --cal-text: hsl(200, 25%, 88%);
  --cal-text-muted: hsl(200, 20%, 60%);
  --cal-text-faint: hsl(200, 15%, 45%);
  --cal-primary: #5588FF;
  --cal-primary-hover: #4477EE;
  --cal-primary-light: hsl(220, 50%, 20%);
  --cal-primary-light-hover: hsl(220, 50%, 25%);
  --cal-today-bg: hsl(220, 40%, 14%);
  --cal-cell-hover: hsl(200, 25%, 15%);
  --cal-tooltip-bg: hsl(200, 20%, 22%);
  --cal-tooltip-text: hsl(200, 25%, 90%);
}

/* ===== Empty state ===== */
.calendar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 16rem;
  gap: 0.5rem;
  color: var(--cal-text-muted);
  font-size: 14px;
}
.calendar-empty-add {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cal-primary);
  background: none;
  border: none;
  cursor: pointer;
}
.calendar-empty-add:hover { text-decoration: underline; }

/* ===== Toolbar ===== */
.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--cal-border);
  background: var(--cal-bg-alt);
  gap: 8px;
  flex-wrap: wrap;
}
.calendar-toolbar-left,
.calendar-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.calendar-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--cal-text-muted);
}
.calendar-nav-btn:hover { background: var(--cal-cell-hover); }
.calendar-header-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cal-text);
  min-width: 180px;
  text-align: center;
  user-select: none;
}
.calendar-today-btn {
  padding: 2px 10px;
  border-radius: 6px;
  border: 1px solid var(--cal-border);
  background: var(--cal-bg);
  font-size: 12px;
  font-weight: 500;
  color: var(--cal-primary);
  cursor: pointer;
}
.calendar-today-btn:hover {
  background: var(--cal-primary-light);
  border-color: var(--cal-primary);
}
.calendar-view-toggle {
  display: flex;
  border: 1px solid var(--cal-border);
  border-radius: 6px;
  overflow: hidden;
}
.calendar-view-btn {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  border: none;
  background: var(--cal-bg);
  color: var(--cal-text-muted);
  cursor: pointer;
  border-right: 1px solid var(--cal-border);
}
.calendar-view-btn:last-child { border-right: none; }
.calendar-view-btn:hover { background: var(--cal-cell-hover); }
.calendar-view-btn.active {
  background: var(--cal-primary);
  color: #fff;
}
.calendar-event-count {
  font-size: 11px;
  color: var(--cal-text-faint);
}

/* ===== Mini Calendar ===== */
.calendar-mini-toggle-wrap { position: relative; }
.calendar-mini-popover {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 50;
  margin-top: 4px;
  background: var(--cal-bg);
  border: 1px solid var(--cal-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 8px;
}
.calendar-mini { width: 210px; }
.calendar-mini-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.calendar-mini-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cal-text);
}
.calendar-mini-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--cal-text-muted);
}
.calendar-mini-nav:hover { background: var(--cal-cell-hover); }
.calendar-mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}
.calendar-mini-day-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--cal-text-faint);
  text-align: center;
  padding: 2px 0;
}
.calendar-mini-cell {
  font-size: 11px;
  width: 28px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--cal-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
.calendar-mini-cell:hover { background: var(--cal-cell-hover); }
.calendar-mini-cell:disabled { cursor: default; }
.calendar-mini-cell.mini-today {
  background: var(--cal-primary);
  color: #fff;
  font-weight: 700;
}
.calendar-mini-cell.mini-selected {
  outline: 2px solid var(--cal-primary);
  outline-offset: -2px;
}

/* ===== Month Grid ===== */
.calendar-body { flex: 1; overflow: auto; padding: 6px; }
.calendar-month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--cal-border);
  border-radius: 8px;
  overflow: hidden;
}
.calendar-col-header {
  background: var(--cal-bg-alt);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cal-text-muted);
  text-align: center;
}
.calendar-month-cell {
  background: var(--cal-bg);
  min-height: 90px;
  padding: 4px;
  position: relative;
}
.calendar-month-cell:hover { background: var(--cal-cell-hover); }
.calendar-month-cell.today { background: var(--cal-today-bg); }
.calendar-month-cell.empty { background: var(--cal-bg-alt); }
.calendar-month-cell-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}
.calendar-day-number {
  font-size: 11px;
  font-weight: 500;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--cal-text);
}
.calendar-day-number.today {
  background: var(--cal-primary);
  color: #fff;
  font-weight: 700;
}
.calendar-day-count {
  font-size: 9px;
  color: var(--cal-text-faint);
}
.calendar-add-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--cal-text-faint);
  opacity: 0;
  transition: opacity 0.15s;
}
.calendar-month-cell:hover .calendar-add-btn { opacity: 1; }
.calendar-add-btn:hover {
  background: var(--cal-primary-light);
  color: var(--cal-primary);
}
.calendar-more-link {
  font-size: 9px;
  color: var(--cal-text-faint);
  padding: 0 4px;
  cursor: pointer;
}
.calendar-more-link:hover { color: var(--cal-primary); }

/* ===== Events ===== */
.calendar-event {
  font-size: 10px;
  padding: 2px 6px;
  margin-bottom: 2px;
  border-radius: 4px;
  background: var(--event-bg);
  color: var(--event-text);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  border-left: 3px solid var(--event-text);
  transition: filter 0.12s;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .calendar-event {
    background: var(--event-dark-bg);
    color: var(--event-dark-text);
    border-left-color: var(--event-dark-text);
  }
}
:root[data-theme="dark"] .calendar-event {
  background: var(--event-dark-bg);
  color: var(--event-dark-text);
  border-left-color: var(--event-dark-text);
}
.calendar-event:hover { filter: brightness(0.95); }
.calendar-event-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.calendar-event-secondary {
  font-size: 9px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.calendar-event-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--event-text);
}
.calendar-event:hover .calendar-event-resize-handle { opacity: 0.5; }
.calendar-event-resize-handle.top { top: 0; }
.calendar-event-resize-handle.bottom { bottom: 0; }

/* ===== Tooltip ===== */
.calendar-tooltip {
  position: fixed;
  z-index: 100;
  background: var(--cal-tooltip-bg);
  color: var(--cal-tooltip-text);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  max-width: 260px;
  pointer-events: none;
}
.calendar-tooltip-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.calendar-tooltip-label {
  font-weight: 600;
  color: var(--cal-tooltip-text);
  opacity: 0.6;
  white-space: nowrap;
  flex-shrink: 0;
}
.calendar-tooltip-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Week / Day Time Grid ===== */
.calendar-time-grid,
.calendar-day-view {
  display: flex;
  gap: 1px;
  background: var(--cal-border);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
  height: 100%;
}
.calendar-day-view { }
.calendar-time-gutter {
  flex-shrink: 0;
  width: 56px;
  display: flex;
  flex-direction: column;
  background: var(--cal-bg-alt);
}
.calendar-hour-label {
  height: 52px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 2px 6px 0 0;
  font-size: 10px;
  color: var(--cal-text-faint);
  font-weight: 500;
  box-sizing: border-box;
  border-bottom: 1px solid var(--cal-border);
}
.calendar-time-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.calendar-time-col.single { flex: 1; }
.calendar-time-col .calendar-col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 2px;
}
.calendar-time-col .calendar-col-header.today {
  background: var(--cal-today-bg);
}
.calendar-col-day-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--cal-text-muted);
  text-transform: uppercase;
}
.calendar-col-day-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--cal-text);
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.calendar-col-day-num.today {
  background: var(--cal-primary);
  color: #fff;
}
.calendar-hour-slots {
  flex: 1;
  position: relative;
  background: var(--cal-bg);
}
.calendar-hour-slot {
  height: 52px;
  border-bottom: 1px solid var(--cal-border);
  box-sizing: border-box;
}
.calendar-hour-slot:hover { background: var(--cal-cell-hover); }
.calendar-time-event-wrap {
  position: absolute;
  left: 2px;
  right: 2px;
  z-index: 2;
  overflow: hidden;
}
.calendar-time-event-wrap .calendar-event {
  height: 100%;
  box-sizing: border-box;
}
`;

function CalendarSkeleton() {
  return (
    <div className="p-1.5 h-full">
      <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden bg-gray-200 dark:bg-[hsl(200,25%,18%)]">
        {DAYS.map((d) => (
          <div key={d} className="bg-gray-100 dark:bg-[hsl(200,28%,12%)] px-2 py-1">
            <div className="h-2.5 w-6 rounded animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]" />
          </div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-[hsl(200,30%,10%)]" style={{ minHeight: 90 }}>
            <div className="p-1">
              <div className="h-4 w-4 rounded-full animate-pulse bg-gray-200 dark:bg-[hsl(200,25%,15%)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CalendarView({
  fields,
  records,
  isLoading,
  onExpandRow,
  onAddRow,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showMiniCal, setShowMiniCal] = useState(false);

  const dateField = useMemo(
    () =>
      fields.find((f) => f.ui_type === 'Date' || f.ui_type === 'DateTime') ??
      fields.find((f) => f.ui_type === 'CreatedTime'),
    [fields],
  );

  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const secondaryField = useMemo(
    () => fields.find((f) => !f.is_primary && !f.is_system && !f.is_hidden && f.ui_type !== 'Date' && f.ui_type !== 'DateTime' && f.ui_type !== 'CreatedTime'),
    [fields],
  );

  // Find first SingleSelect / MultiSelect field for color coding
  const colorField = useMemo(
    () => fields.find((f) => (f.ui_type === 'SingleSelect' || f.ui_type === 'MultiSelect') && f.options?.choices?.length),
    [fields],
  );

  const currentMonth = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    [currentDate],
  );

  // Month view cells
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= lastDate; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentMonth]);

  // Week view days
  const weekDays = useMemo(() => {
    const start = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Records grouped by date string (YYYY-MM-DD)
  const recordsByDateKey = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    if (!dateField) return map;
    for (const r of records) {
      const val = r[dateField.pg_column_name];
      if (!val) continue;
      const d = new Date(val);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [records, dateField]);

  const getRecordsForDate = useCallback(
    (d: Date) => recordsByDateKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [],
    [recordsByDateKey],
  );

  // Records for month view by day number
  const recordsByDay = useMemo(() => {
    const map = new Map<number, RecordRow[]>();
    if (!dateField) return map;
    for (const r of records) {
      const val = r[dateField.pg_column_name];
      if (!val) continue;
      const d = new Date(val);
      if (d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(r);
      }
    }
    return map;
  }, [records, dateField, currentMonth]);

  const today = new Date();

  const goToToday = useCallback(() => setCurrentDate(new Date()), []);

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setCurrentDate((d) => {
        const next = new Date(d);
        if (viewMode === 'month') next.setMonth(next.getMonth() + dir);
        else if (viewMode === 'week') next.setDate(next.getDate() + dir * 7);
        else next.setDate(next.getDate() + dir);
        return next;
      });
    },
    [viewMode],
  );

  const handleMiniSelect = useCallback((d: Date) => {
    setCurrentDate(d);
    setShowMiniCal(false);
  }, []);

  const handleClickEmptyDay = useCallback(
    (date: Date) => {
      if (!dateField) return;
      onAddRow({ [dateField.pg_column_name]: date.toISOString() });
    },
    [dateField, onAddRow],
  );

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') {
      return currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleString('default', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${start.toLocaleString('default', { month: 'short' })} ${start.getDate()} - ${end.toLocaleString('default', { month: 'short' })} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return currentDate.toLocaleString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [viewMode, currentMonth, weekDays, currentDate]);

  const totalEvents = dateField ? records.filter((r) => r[dateField.pg_column_name]).length : 0;

  if (isLoading && records.length === 0) {
    return <CalendarSkeleton />;
  }

  if (!dateField) {
    return (
      <div className="calendar-empty">
        <p>Add a Date or DateTime field to use Calendar view</p>
        <button onClick={() => onAddRow()} className="calendar-empty-add">
          <Plus size={12} /> Add record
        </button>
      </div>
    );
  }

  return (
    <div className="calendar-root">
      <style>{calendarStyles}</style>

      {/* ---- Toolbar ---- */}
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-left">
          <button className="calendar-nav-btn" onClick={() => navigate(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="calendar-header-label">{headerLabel}</span>
          <button className="calendar-nav-btn" onClick={() => navigate(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="calendar-toolbar-right">
          <button className="calendar-today-btn" onClick={goToToday}>Today</button>
          <div className="calendar-mini-toggle-wrap">
            <button
              className="calendar-nav-btn"
              onClick={() => setShowMiniCal((v) => !v)}
              title="Mini calendar"
            >
              <Calendar size={14} />
            </button>
            {showMiniCal && (
              <div className="calendar-mini-popover">
                <MiniCalendar currentDate={currentDate} onSelectDate={handleMiniSelect} />
              </div>
            )}
          </div>
          <div className="calendar-view-toggle">
            {(['month', 'week', 'day'] as const).map((m) => (
              <button
                key={m}
                className={`calendar-view-btn${viewMode === m ? ' active' : ''}`}
                onClick={() => setViewMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <span className="calendar-event-count">
            {totalEvents} event{totalEvents !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ---- Month View ---- */}
      {viewMode === 'month' && (
        <div className="calendar-body">
          <div className="calendar-month-grid">
            {DAYS.map((d) => (
              <div key={d} className="calendar-col-header">{d}</div>
            ))}
            {daysInMonth.map((day, i) => {
              const dayRecords = day !== null ? (recordsByDay.get(day) ?? []) : [];
              const cellDate = day !== null ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day) : null;
              const isToday = cellDate !== null && isSameDay(cellDate, today);
              return (
                <div
                  key={i}
                  className={`calendar-month-cell${isToday ? ' today' : ''}${day === null ? ' empty' : ''}`}
                  onDoubleClick={() => {
                    if (cellDate && dayRecords.length === 0) handleClickEmptyDay(cellDate);
                  }}
                >
                  {day !== null && (
                    <>
                      <div className="calendar-month-cell-header">
                        <div className={`calendar-day-number${isToday ? ' today' : ''}`}>{day}</div>
                        {dayRecords.length > 0 && (
                          <span className="calendar-day-count">{dayRecords.length}</span>
                        )}
                        <button
                          className="calendar-add-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClickEmptyDay(cellDate!);
                          }}
                          title="Add record"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      {dayRecords.slice(0, 3).map((r) => (
                        <CalendarEvent
                          key={r.id}
                          record={r}
                          titleField={titleField}
                          secondaryField={secondaryField}
                          colorField={colorField}
                          fields={fields}
                          compact
                          onExpandRow={onExpandRow}
                        />
                      ))}
                      {dayRecords.length > 3 && (
                        <div className="calendar-more-link">
                          +{dayRecords.length - 3} more
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Week View ---- */}
      {viewMode === 'week' && (
        <div className="calendar-body">
          <div className="calendar-time-grid">
            <div className="calendar-time-gutter">
              <div className="calendar-col-header" />
              {HOURS.map((h) => (
                <div key={h} className="calendar-hour-label">{formatHour(h)}</div>
              ))}
            </div>
            {weekDays.map((wd, ci) => {
              const dayRecords = getRecordsForDate(wd);
              const isToday = isSameDay(wd, today);
              return (
                <div key={ci} className="calendar-time-col">
                  <div className={`calendar-col-header${isToday ? ' today' : ''}`}>
                    <span className="calendar-col-day-name">{DAYS[wd.getDay()]}</span>
                    <span className={`calendar-col-day-num${isToday ? ' today' : ''}`}>{wd.getDate()}</span>
                  </div>
                  <div className="calendar-hour-slots">
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="calendar-hour-slot"
                        onDoubleClick={() => {
                          const d = new Date(wd);
                          d.setHours(h, 0, 0, 0);
                          handleClickEmptyDay(d);
                        }}
                      />
                    ))}
                    {/* Render events positioned by hour */}
                    {dayRecords.map((r) => {
                      const val = r[dateField.pg_column_name];
                      const d = new Date(val);
                      const hour = d.getHours();
                      const minute = d.getMinutes();
                      const topPct = ((hour - 8 + minute / 60) / 13) * 100;
                      if (hour < 8 || hour >= 21) return null;
                      return (
                        <div
                          key={r.id}
                          className="calendar-time-event-wrap"
                          style={{ top: `${Math.max(0, topPct)}%`, height: `${(1 / 13) * 100}%` }}
                        >
                          <CalendarEvent
                            record={r}
                            titleField={titleField}
                            secondaryField={secondaryField}
                            colorField={colorField}
                            fields={fields}
                            onExpandRow={onExpandRow}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Day View ---- */}
      {viewMode === 'day' && (
        <div className="calendar-body">
          <div className="calendar-day-view">
            <div className="calendar-time-gutter">
              <div className="calendar-col-header" />
              {HOURS.map((h) => (
                <div key={h} className="calendar-hour-label">{formatHour(h)}</div>
              ))}
            </div>
            <div className="calendar-time-col single">
              <div className={`calendar-col-header${isSameDay(currentDate, today) ? ' today' : ''}`}>
                <span className="calendar-col-day-name">{DAYS[currentDate.getDay()]}</span>
                <span className={`calendar-col-day-num${isSameDay(currentDate, today) ? ' today' : ''}`}>{currentDate.getDate()}</span>
              </div>
              <div className="calendar-hour-slots">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="calendar-hour-slot"
                    onDoubleClick={() => {
                      const d = new Date(currentDate);
                      d.setHours(h, 0, 0, 0);
                      handleClickEmptyDay(d);
                    }}
                  />
                ))}
                {getRecordsForDate(currentDate).map((r) => {
                  const val = r[dateField.pg_column_name];
                  const d = new Date(val);
                  const hour = d.getHours();
                  const minute = d.getMinutes();
                  const topPct = ((hour - 8 + minute / 60) / 13) * 100;
                  if (hour < 8 || hour >= 21) return null;
                  return (
                    <div
                      key={r.id}
                      className="calendar-time-event-wrap"
                      style={{ top: `${Math.max(0, topPct)}%`, height: `${(1 / 13) * 100}%` }}
                    >
                      <CalendarEvent
                        record={r}
                        titleField={titleField}
                        secondaryField={secondaryField}
                        colorField={colorField}
                        fields={fields}
                        onExpandRow={onExpandRow}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

