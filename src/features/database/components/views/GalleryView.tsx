import { useMemo } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { FieldMeta, RecordRow } from '../../types';
import { getCellRenderer } from '../grid/cell-renderers';

interface GalleryViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function GalleryView({
  fields,
  records,
  totalCount,
  onAddRow,
  onExpandRow,
  page,
  pageSize,
  onPageChange,
}: GalleryViewProps) {
  const titleField = useMemo(
    () => fields.find((f) => f.is_primary) ?? fields[0],
    [fields],
  );

  const previewFields = useMemo(
    () => fields.filter((f) => !f.is_primary && !f.is_system && f.ui_type !== 'ID').slice(0, 4),
    [fields],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {records.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-lg border border-[#E7E7E9] p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onExpandRow?.(r)}
            >
              <div className="text-sm font-semibold text-[#374151] mb-3 truncate">
                {titleField ? r[titleField.pg_column_name] ?? '(empty)' : r.id}
              </div>
              {previewFields.map((f) => {
                const Renderer = getCellRenderer(f.ui_type);
                return (
                  <div key={f.id} className="mb-2">
                    <div className="text-[10px] font-semibold text-[#9AA2AF] uppercase tracking-wider mb-0.5">
                      {f.name}
                    </div>
                    <div className="text-xs text-[#374151]">
                      <Renderer value={r[f.pg_column_name]} field={f} record={r} rowHeight="compact" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <button
            className="flex items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#E7E7E9] min-h-[120px] text-[#9AA2AF] hover:border-[#3366FF] hover:text-[#3366FF] transition-colors text-sm"
            onClick={onAddRow}
          >
            <Plus size={14} /> Add record
          </button>
        </div>
      </div>
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: 40, borderTop: '1px solid #E7E7E9', backgroundColor: '#F9F9FA', fontSize: 13, color: '#6A7184' }}
      >
        <span>{totalCount} record{totalCount !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          <button className="p-1 rounded hover:bg-gray-200 disabled:opacity-40" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button className="p-1 rounded hover:bg-gray-200 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
