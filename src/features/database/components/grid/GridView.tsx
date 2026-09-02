import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, ChevronLeft, ChevronRight, Loader2, Expand } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { ColumnHeader } from './ColumnHeader';
import { GridCell } from './GridCell';
import { RowContextMenu } from './RowContextMenu';
import { GRID_COLORS } from './grid-tokens';
import { getRowColor } from '../../lib/row-colors';

export interface GridViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onAddField: () => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
  onDuplicateRow?: (record: RecordRow) => void;
  onDeleteField?: (fieldId: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const ROW_HEIGHTS: Record<string, number> = {
  compact: 32,
  default: 36,
  tall: 56,
  'extra-tall': 96,
};

const ROW_NUMBER_WIDTH = 72;
const HEADER_HEIGHT = 36;

export default function GridView({
  fields,
  records,
  totalCount,
  isLoading,
  onCellUpdate,
  onAddRow,
  onAddField,
  onExpandRow,
  onDeleteRow,
  onDuplicateRow,
  onDeleteField,
  page,
  pageSize,
  onPageChange,
}: GridViewProps) {
  const rowHeight = useDatabaseUI((s) => s.rowHeight);
  const selectedCellId = useDatabaseUI((s) => s.selectedCellId);
  const setSelectedCell = useDatabaseUI((s) => s.setSelectedCell);
  const setEditingCell = useDatabaseUI((s) => s.setEditingCell);
  const rowColorRules = useDatabaseUI((s) => s.rowColorRules);

  const parentRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; record: RecordRow } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Primary field is pinned first so it can be frozen while scrolling horizontally.
  const visibleFields = useMemo(() => {
    const filtered = fields.filter((f) => !f.is_hidden && !f.is_system);
    const primary = filtered.filter((f) => f.is_primary).sort((a, b) => a.position - b.position);
    const rest = filtered.filter((f) => !f.is_primary).sort((a, b) => a.position - b.position);
    return [...primary, ...rest];
  }, [fields]);

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
    () => ROW_NUMBER_WIDTH + fieldsWithWidths.reduce((sum, f) => sum + f.width, 0) + 44,
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

  const toggleRowSelected = useCallback((recordId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const allSelected = records.length > 0 && records.every((r) => selectedRowIds.has(r.id));
  const someSelected = selectedRowIds.size > 0 && !allSelected;

  const toggleSelectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      if (records.length > 0 && records.every((r) => prev.has(r.id))) return new Set();
      return new Set(records.map((r) => r.id));
    });
  }, [records]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Copy: Cmd/Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedCellId) {
        const [rowId, fieldId] = selectedCellId.split(':');
        const record = records.find((r) => r.id === rowId);
        const field = fieldsWithWidths.find((f) => f.id === fieldId);
        if (record && field) {
          const val = record[field.pg_column_name];
          if (val != null) navigator.clipboard.writeText(String(val));
        }
        return;
      }

      // Paste: Cmd/Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && selectedCellId) {
        const [rowId, fieldId] = selectedCellId.split(':');
        const field = fieldsWithWidths.find((f) => f.id === fieldId);
        if (field && !field.is_system) {
          navigator.clipboard.readText().then((text) => {
            onCellUpdate(rowId, fieldId, text);
          });
        }
        return;
      }

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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const field = fieldsWithWidths[colIdx];
        if (field && !field.is_system) {
          onCellUpdate(rowId, fieldId, null);
        }
        return;
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setEditingCell(selectedCellId);
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
  }, [selectedCellId, records, fieldsWithWidths, setSelectedCell, setEditingCell, onCellUpdate]);

  if (records.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ backgroundColor: GRID_COLORS.bg }}>
        <p style={{ color: GRID_COLORS.muted, fontSize: 14 }}>
          No records. Click + to add a row.
        </p>
        <button
          onClick={onAddRow}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm hover:bg-gray-100"
          style={{ color: GRID_COLORS.selected }}
        >
          <Plus size={14} /> Add row
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: GRID_COLORS.bg }}>
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex"
            style={{
              height: HEADER_HEIGHT,
              backgroundColor: GRID_COLORS.headerBg,
              borderBottom: `1px solid ${GRID_COLORS.border}`,
            }}
          >
            <div
              className="sticky left-0 z-30 flex items-center justify-center shrink-0 group"
              style={{
                width: ROW_NUMBER_WIDTH,
                minWidth: ROW_NUMBER_WIDTH,
                backgroundColor: GRID_COLORS.headerBg,
                borderRight: `1px solid ${GRID_COLORS.border}`,
                fontSize: 11,
                color: GRID_COLORS.muted,
              }}
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded cursor-pointer"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  style={{ accentColor: GRID_COLORS.selected }}
                  aria-label="Select all rows"
                />
              )}
            </div>

            {fieldsWithWidths.map((field) => (
              <ColumnHeader
                key={field.id}
                field={field}
                onResize={handleResize}
                onDeleteField={onDeleteField}
                frozen={field.is_primary}
                frozenLeft={field.is_primary ? ROW_NUMBER_WIDTH : undefined}
              />
            ))}

            <div
              className="flex items-center justify-center shrink-0 cursor-pointer hover:bg-black/5"
              style={{
                width: 44,
                minWidth: 44,
                backgroundColor: GRID_COLORS.headerBg,
                borderRight: `1px solid ${GRID_COLORS.border}`,
                color: GRID_COLORS.muted,
              }}
              onClick={onAddField}
              title="Add field"
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
              const rowNum = (page - 1) * pageSize + virtualRow.index + 1;
              const isActiveCellRow = selectedCellId?.startsWith(record.id + ':');
              const isHovered = hoveredRowId === record.id;
              const isChecked = selectedRowIds.has(record.id);
              const colorRuleBg = getRowColor(record, rowColorRules, fields);
              const rowBg = isChecked || isActiveCellRow || isHovered ? GRID_COLORS.hoverRow : (colorRuleBg || GRID_COLORS.bg);
              const rowNumBg = isChecked || isActiveCellRow || isHovered ? GRID_COLORS.hoverRow : GRID_COLORS.headerBg;

              return (
                <div
                  key={record.id}
                  className="absolute left-0 w-full flex"
                  style={{
                    height: rowHeightPx,
                    top: virtualRow.start,
                    backgroundColor: rowBg,
                  }}
                  onMouseEnter={() => setHoveredRowId(record.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowMenu({ x: e.clientX, y: e.clientY, record });
                  }}
                >
                  {/* Row number / checkbox + expand */}
                  <div
                    className="sticky left-0 z-10 flex items-center justify-center shrink-0 gap-1"
                    style={{
                      width: ROW_NUMBER_WIDTH,
                      minWidth: ROW_NUMBER_WIDTH,
                      backgroundColor: rowNumBg,
                      borderRight: `1px solid ${GRID_COLORS.border}`,
                      borderBottom: `1px solid ${GRID_COLORS.border}`,
                      fontSize: 11,
                      color: GRID_COLORS.muted,
                    }}
                  >
                    {isHovered || isChecked ? (
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                        checked={isChecked}
                        onChange={() => toggleRowSelected(record.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: GRID_COLORS.selected }}
                        aria-label={`Select row ${rowNum}`}
                      />
                    ) : (
                      <span>{rowNum}</span>
                    )}
                    {isHovered && onExpandRow && (
                      <button
                        className="p-0.5 rounded hover:bg-[#3366FF]/10 hover:text-[#3366FF]"
                        onClick={() => onExpandRow(record)}
                        title="Expand record"
                      >
                        <Expand size={13} />
                      </button>
                    )}
                  </div>

                  {fieldsWithWidths.map((field) => (
                    <GridCell
                      key={field.id}
                      field={field}
                      record={record}
                      onCellUpdate={onCellUpdate}
                      frozen={field.is_primary}
                      frozenLeft={field.is_primary ? ROW_NUMBER_WIDTH : undefined}
                      rowBg={rowBg}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Add row button */}
          <button
            className="flex items-center w-full text-left cursor-pointer transition-colors"
            style={{
              height: rowHeightPx,
              borderBottom: `1px solid ${GRID_COLORS.border}`,
              backgroundColor: GRID_COLORS.bg,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = GRID_COLORS.hoverRow)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = GRID_COLORS.bg)}
            onClick={onAddRow}
          >
            <div
              className="flex items-center gap-1.5 px-4"
              style={{ color: GRID_COLORS.muted, fontSize: 13 }}
            >
              <Plus size={14} /> Add row
            </div>
          </button>
        </div>
      </div>

      {/* Pagination footer */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 40,
          borderTop: `1px solid ${GRID_COLORS.border}`,
          backgroundColor: GRID_COLORS.headerBg,
          fontSize: 13,
          color: GRID_COLORS.text,
        }}
      >
        <span>
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Row context menu */}
      {rowMenu && (
        <RowContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
          onExpand={() => { onExpandRow?.(rowMenu.record); setRowMenu(null); }}
          onInsertAbove={onAddRow}
          onInsertBelow={onAddRow}
          onDuplicate={() => { onDuplicateRow?.(rowMenu.record); setRowMenu(null); }}
          onDelete={() => {
            if (window.confirm('Delete this record? This cannot be undone.')) {
              onDeleteRow?.(rowMenu.record.id);
            }
            setRowMenu(null);
          }}
        />
      )}
    </div>
  );
}
