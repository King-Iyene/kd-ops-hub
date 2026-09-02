import { useMemo, useState, useCallback } from 'react';
import { Plus, GripVertical } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';
import { PILL_COLORS } from '../../types';
import { getCellRenderer } from '../grid/cell-renderers';

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

function getPillColor(colorName: string) {
  return PILL_COLORS.find((c) => c.name === colorName) || PILL_COLORS[7];
}

export default function KanbanView({
  fields,
  records,
  onCellUpdate,
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

  const previewFields = useMemo(
    () =>
      fields
        .filter((f) => !f.is_primary && !f.is_system && f.ui_type !== 'ID' && f.ui_type !== 'SingleSelect')
        .slice(0, 3),
    [fields],
  );

  const choices = useMemo(() => {
    const opts = groupField?.options?.choices ?? [];
    return [
      { title: 'Uncategorized', color: 'Gray' },
      ...opts,
    ];
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

  const [dragRecordId, setDragRecordId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragStart = useCallback((recordId: string) => {
    setDragRecordId(recordId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colTitle: string) => {
    e.preventDefault();
    setDropTarget(colTitle);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (colTitle: string) => {
      if (dragRecordId && groupField) {
        const newValue = colTitle === 'Uncategorized' ? null : colTitle;
        onCellUpdate(dragRecordId, groupField.id, newValue);
      }
      setDragRecordId(null);
      setDropTarget(null);
    },
    [dragRecordId, groupField, onCellUpdate],
  );

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
        const color = getPillColor(col.color);
        const isOver = dropTarget === col.title;
        return (
          <div
            key={col.title}
            className="flex flex-col shrink-0 rounded-lg overflow-hidden transition-shadow"
            style={{
              width: 280,
              backgroundColor: '#F9F9FA',
              border: isOver ? '2px solid #3366FF' : '1px solid #E7E7E9',
            }}
            onDragOver={(e) => handleDragOver(e, col.title)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(col.title)}
          >
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{
                backgroundColor: color.bg,
                borderBottom: '1px solid #E7E7E9',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {col.title}
                </span>
                <span className="text-[10px] font-medium" style={{ color: color.text, opacity: 0.6 }}>
                  {items.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-md p-3 shadow-sm border border-[#E7E7E9] cursor-pointer hover:shadow-md transition-shadow group"
                  draggable
                  onDragStart={() => handleDragStart(r.id)}
                  onClick={() => onExpandRow?.(r)}
                >
                  <div className="flex items-start gap-1">
                    <GripVertical
                      size={12}
                      className="mt-0.5 shrink-0 text-[#D1D5DB] opacity-0 group-hover:opacity-100 cursor-grab"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#374151] truncate">
                        {titleField ? r[titleField.pg_column_name] ?? '(empty)' : r.id}
                      </div>
                      {previewFields.map((f) => {
                        const Renderer = getCellRenderer(f.ui_type);
                        return (
                          <div key={f.id} className="mt-1.5">
                            <div className="text-[9px] font-semibold text-[#9AA2AF] uppercase tracking-wider mb-0.5">
                              {f.name}
                            </div>
                            <div className="text-xs text-[#6A7184]">
                              <Renderer value={r[f.pg_column_name]} field={f} record={r} rowHeight="compact" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="flex items-center gap-1 px-3 py-2 text-xs text-[#9AA2AF] hover:text-[#3366FF] hover:bg-white/60 transition-colors border-t border-[#E7E7E9]"
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
