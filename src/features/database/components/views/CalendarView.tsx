import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const dateField = useMemo(
    () => fields.find((f) => f.ui_type === 'Date' || f.ui_type === 'DateTime' || f.ui_type === 'CreatedTime'),
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

  if (!dateField) {
    return (
      <div className="flex items-center justify-center h-64 text-[#6A7184] text-sm">
        Add a Date or DateTime field to use Calendar view
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#E7E7E9]">
        <button className="p-1 rounded hover:bg-gray-100" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
          <ChevronLeft size={16} className="text-[#6A7184]" />
        </button>
        <span className="text-sm font-semibold text-[#374151]">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
        <button className="p-1 rounded hover:bg-gray-100" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
          <ChevronRight size={16} className="text-[#6A7184]" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-7 gap-px bg-[#E7E7E9] rounded-lg overflow-hidden">
          {DAYS.map((d) => (
            <div key={d} className="bg-[#F9F9FA] px-2 py-1.5 text-[11px] font-semibold text-[#6A7184] text-center">
              {d}
            </div>
          ))}
          {daysInMonth.map((day, i) => (
            <div
              key={i}
              className="bg-white min-h-[80px] p-1"
            >
              {day !== null && (
                <>
                  <div
                    className="text-[11px] font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full"
                    style={{
                      color: isCurrentMonth && day === today.getDate() ? '#FFF' : '#374151',
                      backgroundColor: isCurrentMonth && day === today.getDate() ? '#3366FF' : undefined,
                    }}
                  >
                    {day}
                  </div>
                  {(recordsByDay.get(day) ?? []).slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="text-[10px] px-1 py-0.5 mb-0.5 rounded bg-[#EBF0FF] text-[#3366FF] truncate cursor-pointer hover:bg-[#D6E0FF]"
                      onClick={() => onExpandRow?.(r)}
                    >
                      {titleField ? r[titleField.pg_column_name] ?? '' : r.id}
                    </div>
                  ))}
                  {(recordsByDay.get(day) ?? []).length > 3 && (
                    <div className="text-[9px] text-[#9AA2AF] px-1">
                      +{(recordsByDay.get(day)!.length - 3)} more
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
