import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';

interface KanbanViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
}

export default function KanbanView({
  fields,
  records,
  onAddRow,
  onExpandRow,
}: KanbanViewProps) {
  const groupField = useMemo(
    () => fields.find((f) => f.ui_type === 'SingleSelect'),
    [fields],
  );

  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const choices = useMemo(() => {
    const opts = groupField?.options?.choices ?? [];
    return [{ title: 'Uncategorized', color: '#F1F5F9' }, ...opts.map((c) => ({ title: c.title, color: c.color }))];
  }, [groupField]);

  const grouped = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    for (const c of choices) map.set(c.title, []);
    for (const r of records) {
      const val = groupField ? (r[groupField.pg_column_name] ?? 'Uncategorized') : 'Uncategorized';
      const list = map.get(val) ?? map.get('Uncategorized')!;
      list.push(r);
    }
    return map;
  }, [records, groupField, choices]);

  if (!groupField) {
    return (
      <div className="flex items-center justify-center h-64 text-[#6A7184] text-sm">
        Add a Single Select field to use Kanban view
      </div>
    );
  }

  return (
    <div className="flex gap-3 p-4 h-full overflow-x-auto">
      {choices.map((col) => {
        const items = grouped.get(col.title) ?? [];
        return (
          <div
            key={col.title}
            className="flex flex-col shrink-0 rounded-lg"
            style={{ width: 280, backgroundColor: '#F9F9FA', border: '1px solid #E7E7E9' }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#E7E7E9]">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <span className="text-xs font-semibold text-[#374151]">{col.title}</span>
                <span className="text-[10px] text-[#9AA2AF] font-medium">{items.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-md p-3 shadow-sm border border-[#E7E7E9] cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onExpandRow?.(r)}
                >
                  <div className="text-sm font-medium text-[#374151] truncate">
                    {titleField ? r[titleField.pg_column_name] ?? '(empty)' : r.id}
                  </div>
                </div>
              ))}
            </div>
            <button
              className="flex items-center gap-1 px-3 py-2 text-xs text-[#9AA2AF] hover:text-[#3366FF] hover:bg-white/60 transition-colors"
              onClick={onAddRow}
            >
              <Plus size={12} /> New
            </button>
          </div>
        );
      })}
    </div>
  );
}
