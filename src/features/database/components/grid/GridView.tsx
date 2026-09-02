import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, ChevronLeft, ChevronRight, Loader2, Expand, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { ColumnHeader } from './ColumnHeader';
import { GridCell } from './GridCell';

export interface GridViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onAddField: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
  onDuplicateRow?: (record: RecordRow) => void;
  onDeleteField?: (fieldId: string) => void;
  onBulkDeleteRows?: (recordIds: string[]) => void;
  onReorderFields?: (fieldIds: string[]) => void;
}

const ROW_HEIGHTS: Record<string, number> = {
  compact: 32,
  default: 44,
  tall: 64,
  'extra-tall': 96,
};

const ROW_NUMBER_WIDTH = 64;
const HEADER_HEIGHT = 36;

export default function GridView({
  fields,
  records,
  totalCount,
  isLoading,
  onCellUpdate,
  onAddRow,
  onAddField,
  page,
  pageSize,
  onPageChange,
  onExpandRow,
  onDeleteRow,
  onDuplicateRow,
  onDeleteField,
  onBulkDeleteRows,
}: GridViewProps) {
  const rowHeight = useDatabaseUI((s) => s.rowHeight);
  const selectedCellId = useDatabaseUI((s) => s.selectedCellId);
  const setSelectedCell = useDatabaseUI((s) => s.setSelectedCell);
  const setEditingCell = useDatabaseUI((s) => s.setEditingCell);

  const parentRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; record: RecordRow } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      if (prev.size === records.length) return new Set();
      return new Set(records.map((r) => r.id));
    });
  }, [records]);

  const handleBulkDelete = useCallback(() => {
    if (selectedRowIds.size === 0 || !onBulkDeleteRows) return;
    if (!confirm(`Delete ${selectedRowIds.size} selected record(s)?`)) return;
    onBulkDeleteRows(Array.from(selectedRowIds));
    setSelectedRowIds(new Set());
  }, [selectedRowIds, onBulkDeleteRows]);

  const visibleFields = useMemo(
    () =>
      fields
        .filter((f) => !f.is_hidden)
        .sort((a, b) => a.position - b.position),
    [fields],
  );

  const getFieldWidth = useCallback(
    (field: FieldMeta) => columnWidths[field.id] ?? field.width ?? 180,
    [columnWidths],
  );

  const fieldsWithWidths = useMemo(
    () =>
      visibleFields.map((f) => ({
        ...f,
        width: getFieldWidth(f),
      })),
    [visibleFields, getFieldWidth],
  );

  const totalWidth = useMemo(
    () => ROW_NUMBER_WIDTH + fieldsWithWidths.reduce((sum, f) => sum + f.width, 0),
    [fieldsWithWidths],
  );

  const rowHeightPx = ROW_HEIGHTS[rowHeight] || ROW_HEIGHTS.default;

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeightPx,
    overscan: 10,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleResize = useCallback((fieldId: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [fieldId]: width }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCellId) return;
      const [rowId, fieldId] = selectedCellId.split(':');
      const rowIdx = records.findIndex((r) => r.id === rowId);
      const colIdx = fieldsWithWidths.findIndex((f) => f.id === fieldId);
      if (rowIdx === -1 || colIdx === -1) return;

      let nextRow = rowIdx;
      let nextCol = colIdx;

      if (e.key === 'ArrowUp') {
        nextRow = Math.max(0, rowIdx - 1);
      } else if (e.key === 'ArrowDown') {
        nextRow = Math.min(records.length - 1, rowIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        nextCol = Math.max(0, colIdx - 1);
      } else if (e.key === 'ArrowRight') {
        nextCol = Math.min(fieldsWithWidths.length - 1, colIdx + 1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          nextCol = colIdx - 1;
          if (nextCol < 0) {
            nextCol = fieldsWithWidths.length - 1;
            nextRow = Math.max(0, rowIdx - 1);
          }
        } else {
          nextCol = colIdx + 1;
          if (nextCol >= fieldsWithWidths.length) {
            nextCol = 0;
            nextRow = Math.min(records.length - 1, rowIdx + 1);
          }
        }
      } else if (e.key === 'Escape') {
        setSelectedCell(null);
        setEditingCell(null);
        return;
      } else {
        return;
      }

      e.preventDefault();
      const nextCellId = `${records[nextRow].id}:${fieldsWithWidths[nextCol].id}`;
      setSelectedCell(nextCellId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellId, records, fieldsWithWidths, setSelectedCell, setEditingCell]);

  if (records.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p style={{ color: '#94A3B8', fontSize: 14 }}>
          No records. Click + to add a row.
        </p>
        <button
          onClick={onAddRow}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm hover:bg-gray-100"
          style={{ color: '#3366FF' }}
        >
          <Plus size={14} /> Add row
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex"
            style={{
              height: HEADER_HEIGHT,
              backgroundColor: '#F9F9FA',
              borderBottom: '1px solid #E7E7E9',
            }}
          >
            <div
              className="sticky left-0 z-30 flex items-center justify-center shrink-0"
              style={{
                width: ROW_NUMBER_WIDTH,
                minWidth: ROW_NUMBER_WIDTH,
                backgroundColor: '#F9F9FA',
                borderRight: '1px solid #E7E7E9',
                fontSize: 11,
                color: '#9AA2AF',
              }}
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {!isLoading && records.length > 0 && (
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-[#3366FF]"
                  checked={selectedRowIds.size === records.length && records.length > 0}
                  onChange={toggleSelectAll}
                />
              )}
              {!isLoading && records.length === 0 && '#'}
            </div>

            {fieldsWithWidths.map((field) => (
              <ColumnHeader
                key={field.id}
                field={field}
                onResize={handleResize}
                onDelete={onDeleteField}
              />
            ))}

            <div
              className="flex items-center justify-center shrink-0 cursor-pointer hover:bg-gray-100"
              style={{
                width: 44,
                minWidth: 44,
                backgroundColor: '#F9F9FA',
                borderRight: '1px solid #E7E7E9',
                color: '#9AA2AF',
              }}
              onClick={onAddField}
            >
              <Plus size={14} />
            </div>
          </div>

          {/* Virtualized rows */}
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const record = records[virtualRow.index];
              const rowNum = page * pageSize + virtualRow.index + 1;
              const isRowSelected = selectedCellId?.startsWith(record.id + ':');

              return (
                <div
                  key={record.id}
                  className="absolute left-0 w-full flex group/row"
                  style={{
                    height: rowHeightPx,
                    top: virtualRow.start,
                    backgroundColor: isRowSelected ? '#EBF0FF' : undefined,
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowMenu({ x: e.clientX, y: e.clientY, record });
                  }}
                  onMouseEnter={(e) => {
                    if (!isRowSelected) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#F9F9FA';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isRowSelected) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '';
                    }
                  }}
                >
                  {/* Row number with checkbox + expand icon */}
                  <div
                    className="sticky left-0 z-10 flex items-center justify-center shrink-0 group/num"
                    style={{
                      width: ROW_NUMBER_WIDTH,
                      minWidth: ROW_NUMBER_WIDTH,
                      backgroundColor: selectedRowIds.has(record.id) ? '#EBF0FF' : isRowSelected ? '#EBF0FF' : '#F9F9FA',
                      borderRight: '1px solid #E7E7E9',
                      borderBottom: '1px solid #E7E7E9',
                      fontSize: 11,
                      color: '#9AA2AF',
                    }}
                  >
                    {selectedRowIds.has(record.id) ? (
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-[#3366FF]"
                        checked
                        onChange={() => toggleRowSelection(record.id)}
                      />
                    ) : (
                      <>
                        <span className="group-hover/row:hidden">{rowNum}</span>
                        <div className="hidden group-hover/row:flex items-center gap-1">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-[#3366FF]"
                            checked={false}
                            onChange={() => toggleRowSelection(record.id)}
                          />
                          {onExpandRow && (
                            <button
                              className="p-0.5 rounded hover:bg-gray-200"
                              onClick={(e) => { e.stopPropagation(); onExpandRow(record); }}
                            >
                              <Expand size={12} />
                            </button>
                          )}
                          <button
                            className="p-0.5 rounded hover:bg-gray-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRowMenu({ x: e.clientX, y: e.clientY, record });
                            }}
                          >
                            <MoreHorizontal size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {fieldsWithWidths.map((field) => (
                    <GridCell
                      key={field.id}
                      field={field}
                      record={record}
                      onCellUpdate={onCellUpdate}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Add row button */}
          <div
            className="flex items-center cursor-pointer hover:bg-gray-50"
            style={{
              height: rowHeightPx,
              borderBottom: '1px solid #E7E7E9',
            }}
            onClick={onAddRow}
          >
            <div
              className="flex items-center gap-1 px-4"
              style={{ color: '#9AA2AF', fontSize: 13 }}
            >
              <Plus size={14} /> Add row
            </div>
          </div>
        </div>
      </div>

      {/* Row context menu */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setRowMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-[#E7E7E9] rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: rowMenu.x, top: rowMenu.y }}
          >
            {onExpandRow && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                onClick={() => { onExpandRow(rowMenu.record); setRowMenu(null); }}
              >
                <Expand size={14} className="text-[#9AA2AF]" /> Expand row
              </button>
            )}
            {onDuplicateRow && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                onClick={() => { onDuplicateRow(rowMenu.record); setRowMenu(null); }}
              >
                <Copy size={14} className="text-[#9AA2AF]" /> Duplicate row
              </button>
            )}
            {onDeleteRow && (
              <>
                <div className="h-px bg-[#E7E7E9] my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-red-50 flex items-center gap-2 text-red-500"
                  onClick={() => { onDeleteRow(rowMenu.record.id); setRowMenu(null); }}
                >
                  <Trash2 size={14} /> Delete row
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Bulk action bar */}
      {selectedRowIds.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 shrink-0"
          style={{
            height: 36,
            backgroundColor: '#3366FF',
            color: '#fff',
            fontSize: 13,
          }}
        >
          <span className="font-medium">{selectedRowIds.size} record{selectedRowIds.size !== 1 ? 's' : ''} selected</span>
          <button
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-xs font-medium"
            onClick={handleBulkDelete}
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-xs font-medium"
            onClick={() => setSelectedRowIds(new Set())}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pagination */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 40,
          borderTop: '1px solid #E7E7E9',
          backgroundColor: '#F9F9FA',
          fontSize: 13,
          color: '#6A7184',
        }}
      >
        <span>
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
