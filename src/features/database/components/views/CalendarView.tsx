import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';

interface CalendarViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onExpandRow?: (record: RecordRow) => void;
  onAddRow: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarView({
  fields,
  records,
  onExpandRow,
  onAddRow,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const dateField = useMemo(
    () => fields.find((f) => f.ui_type === 'Date' || f.ui_type === 'DateTime') ??
      fields.find((f) => f.ui_type === 'CreatedTime'),
    [fields],
  );

  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

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
  const isCurrentMonth = today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const prevMonth = useCallback(() => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }, []);

  if (!dateField) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-[#6A7184] text-sm">
        <p>Add a Date or DateTime field to use Calendar view</p>
        <button
          onClick={onAddRow}
          className="flex items-center gap-1 text-xs text-[#3366FF] hover:underline"
        >
          <Plus size={12} /> Add record
        </button>
      </div>
    );
  }

  const totalEvents = records.filter((r) => r[dateField.pg_column_name]).length;

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid #E7E7E9', backgroundColor: '#F9F9FA' }}
      >
        <div className="flex items-center gap-2">
          <button className="p-1 rounded hover:bg-gray-200" onClick={prevMonth}>
            <ChevronLeft size={16} className="text-[#6A7184]" />
          </button>
          <span className="text-sm font-semibold text-[#374151] min-w-[140px] text-center">
            {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button className="p-1 rounded hover:bg-gray-200" onClick={nextMonth}>
            <ChevronRight size={16} className="text-[#6A7184]" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-0.5 rounded text-xs font-medium text-[#3366FF] hover:bg-[#EBF0FF]"
            onClick={goToToday}
          >
            Today
          </button>
          <span className="text-xs text-[#9AA2AF]">
            {totalEvents} event{totalEvents !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-7 gap-px bg-[#E7E7E9] rounded-lg overflow-hidden">
          {DAYS.map((d) => (
            <div key={d} className="bg-[#F9F9FA] px-2 py-1.5 text-[11px] font-semibold text-[#6A7184] text-center">
              {d}
            </div>
          ))}
          {daysInMonth.map((day, i) => {
            const dayRecords = day !== null ? (recordsByDay.get(day) ?? []) : [];
            const isToday = isCurrentMonth && day === today.getDate();
            return (
              <div
                key={i}
                className="bg-white min-h-[90px] p-1"
                style={{ backgroundColor: isToday ? '#FAFBFF' : undefined }}
              >
                {day !== null && (
                  <>
                    <div className="flex items-center justify-between mb-0.5">
                      <div
                        className="text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full"
                        style={{
                          color: isToday ? '#FFF' : '#374151',
                          backgroundColor: isToday ? '#3366FF' : undefined,
                        }}
                      >
                        {day}
                      </div>
                      {dayRecords.length > 0 && (
                        <span className="text-[9px] text-[#9AA2AF]">{dayRecords.length}</span>
                      )}
                    </div>
                    {dayRecords.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="text-[10px] px-1.5 py-0.5 mb-0.5 rounded bg-[#EBF0FF] text-[#3366FF] truncate cursor-pointer hover:bg-[#D6E0FF] transition-colors"
                        onClick={() => onExpandRow?.(r)}
                        title={titleField ? String(r[titleField.pg_column_name] ?? '') : r.id}
                      >
                        {titleField ? r[titleField.pg_column_name] ?? '' : r.id}
                      </div>
                    ))}
                    {dayRecords.length > 3 && (
                      <div className="text-[9px] text-[#9AA2AF] px-1 cursor-pointer hover:text-[#3366FF]">
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
    </div>
  );
}
