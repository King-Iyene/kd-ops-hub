import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Calendar } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';

interface CalendarViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onExpandRow?: (record: RecordRow) => void;
  onAddRow: () => void;
}

const TEAL = '#3366FF';
const TEXT = '#374151';
const MUTED = '#9AA2AF';
const BORDER = '#E7E7E9';
const SURFACE = '#F9F9FA';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_RECORDS = 3;

// Pill colors cycled per-record for visual variety
const PILL_COLORS = [
  { bg: '#E0F2FE', text: '#0369A1' },
  { bg: '#F0FDF4', text: '#15803D' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#EDE9FE', text: '#6D28D9' },
  { bg: '#FFEDD5', text: '#9A3412' },
];

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMonthYear(date: Date): string {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function getCalendarGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0 = Sunday

  const days: Date[] = [];

  // Fill leading days from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Fill trailing days to complete the last week
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

function getPrimaryFieldValue(record: RecordRow, fields: FieldMeta[]): string {
  const primary = fields.find((f) => f.is_primary);
  if (!primary) return record.id;
  const val = record[primary.pg_column_name];
  if (val == null) return '';
  return String(val);
}

function parseRecordDate(record: RecordRow, field: FieldMeta): Date | null {
  const val = record[field.pg_column_name];
  if (val == null || val === '') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export default function CalendarView({
  fields,
  records,
  totalCount,
  isLoading,
  onExpandRow,
  onAddRow,
}: CalendarViewProps) {
  const { calendarFieldId, setCalendarFieldId } = useDatabaseUI();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const today = useMemo(() => new Date(), []);

  const dateFields = useMemo(
    () => fields.filter((f) => f.ui_type === 'Date' || f.ui_type === 'DateTime'),
    [fields],
  );

  const selectedField = useMemo(
    () => dateFields.find((f) => f.id === calendarFieldId) ?? null,
    [dateFields, calendarFieldId],
  );

  const calendarDays = useMemo(
    () => getCalendarGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth],
  );

  // Map date string (YYYY-MM-DD) -> records for that day
  const recordsByDay = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    if (!selectedField) return map;

    for (const record of records) {
      const d = parseRecordDate(record, selectedField);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key);
      if (arr) {
        arr.push(record);
      } else {
        map.set(key, [record]);
      }
    }
    return map;
  }, [records, selectedField]);

  const navigateMonth = useCallback((delta: number) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  // No date field selected
  if (!selectedField) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 400,
          gap: 16,
          color: MUTED,
        }}
      >
        <Calendar size={48} strokeWidth={1.5} />
        <p style={{ fontSize: 16, margin: 0 }}>
          Select a date field to display records on the calendar
        </p>
        {dateFields.length > 0 ? (
          <select
            value=""
            onChange={(e) => setCalendarFieldId(e.target.value || null)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              fontSize: 14,
              color: TEXT,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            <option value="">Choose a date field...</option>
            {dateFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <p style={{ fontSize: 14, margin: 0, color: MUTED }}>
            No date or datetime fields found in this table.
          </p>
        )}
      </div>
    );
  }

  const currentMonthIndex = currentMonth.getMonth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Header: field selector + navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${BORDER}`,
          background: '#fff',
          flexShrink: 0,
        }}
      >
        {/* Field selector */}
        <select
          value={calendarFieldId ?? ''}
          onChange={(e) => setCalendarFieldId(e.target.value || null)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            fontSize: 13,
            color: TEXT,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigateMonth(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: '#fff',
              cursor: 'pointer',
              color: TEXT,
            }}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: TEXT,
              minWidth: 180,
              textAlign: 'center',
            }}
          >
            {formatMonthYear(currentMonth)}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: '#fff',
              cursor: 'pointer',
              color: TEXT,
            }}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={goToToday}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: TEXT,
              marginLeft: 4,
            }}
          >
            Today
          </button>
        </div>

        {/* Record count */}
        <span style={{ fontSize: 13, color: MUTED }}>
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, overflow: 'auto', background: SURFACE }}>
        {/* Day name headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: `1px solid ${BORDER}`,
            background: '#fff',
          }}
        >
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              style={{
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: MUTED,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textAlign: 'center',
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
          }}
        >
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === currentMonthIndex;
            const isToday = isSameDay(day, today);
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const dayRecords = recordsByDay.get(key) ?? [];
            const visibleRecords = dayRecords.slice(0, MAX_VISIBLE_RECORDS);
            const overflowCount = dayRecords.length - MAX_VISIBLE_RECORDS;

            return (
              <div
                key={idx}
                onClick={(e) => {
                  // Click on empty area of the day cell
                  if (e.target === e.currentTarget) {
                    onAddRow();
                  }
                }}
                style={{
                  minHeight: 100,
                  borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${BORDER}` : undefined,
                  borderBottom: `1px solid ${BORDER}`,
                  padding: 4,
                  background: isToday ? '#F0FDFA' : '#fff',
                  cursor: 'default',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Day number */}
                <div style={{ padding: '2px 4px', marginBottom: 2 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: isToday ? 26 : undefined,
                      height: isToday ? 26 : undefined,
                      borderRadius: isToday ? '50%' : undefined,
                      background: isToday ? TEAL : undefined,
                      color: isToday ? '#fff' : isCurrentMonth ? TEXT : MUTED,
                      fontSize: 13,
                      fontWeight: isToday ? 700 : isCurrentMonth ? 500 : 400,
                      lineHeight: 1,
                    }}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Record pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  {visibleRecords.map((record, rIdx) => {
                    const pillColor = PILL_COLORS[rIdx % PILL_COLORS.length];
                    const label = getPrimaryFieldValue(record, fields);
                    return (
                      <button
                        key={record.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onExpandRow?.(record);
                        }}
                        title={label}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: 'none',
                          background: pillColor.bg,
                          color: pillColor.text,
                          fontSize: 12,
                          lineHeight: '18px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label || ' '}
                      </button>
                    );
                  })}
                  {overflowCount > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: TEAL,
                        fontWeight: 500,
                        padding: '0 6px',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Expand the first overflow record as a reasonable action
                        onExpandRow?.(dayRecords[MAX_VISIBLE_RECORDS]);
                      }}
                    >
                      +{overflowCount} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.6)',
            zIndex: 10,
          }}
        >
          <Loader2
            size={32}
            style={{ animation: 'spin 1s linear infinite', color: TEAL }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </div>
  );
}
