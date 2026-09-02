import { X } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../types';
import { getCellRenderer } from './grid/cell-renderers';

interface ExpandedRowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: RecordRow | null;
  fields: FieldMeta[];
  baseId: string;
  tableId: string;
}

export function ExpandedRowModal({
  open,
  onOpenChange,
  record,
  fields,
}: ExpandedRowModalProps) {
  if (!open || !record) return null;

  const visibleFields = fields
    .filter((f) => !f.is_hidden && f.ui_type !== 'ID')
    .sort((a, b) => a.position - b.position);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative bg-white dark:bg-[hsl(200,30%,10%)] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        style={{ border: '1px solid #E7E7E9' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E7E7E9]">
          <h2 className="text-sm font-semibold text-[#374151]">Record Detail</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X size={16} className="text-[#6A7184]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {visibleFields.map((field) => {
            const Renderer = getCellRenderer(field.ui_type);
            return (
              <div key={field.id}>
                <label className="block text-[11px] font-semibold text-[#6A7184] uppercase tracking-wider mb-1">
                  {field.name}
                </label>
                <div className="text-sm text-[#374151] min-h-[28px] flex items-center">
                  <Renderer
                    value={record[field.pg_column_name]}
                    field={field}
                    record={record}
                    rowHeight="default"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
