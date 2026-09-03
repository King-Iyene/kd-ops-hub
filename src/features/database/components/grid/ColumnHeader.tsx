import React, { useCallback, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, EyeOff, Pencil, Trash2, Copy, ArrowLeftRight, Info, Lock, Unlock, Filter, Group } from 'lucide-react';
import type { FieldMeta } from '@/features/database/types';
import { getFieldTypeIcon } from './field-icons';
import { useDatabaseUI } from '../../lib/store';
import { useGridColors } from '../../hooks/useGridColors';

interface ColumnHeaderProps {
  field: FieldMeta;
  onResize: (fieldId: string, width: number) => void;
  onSort?: (fieldId: string) => void;
  onDelete?: (fieldId: string) => void;
  onEditField?: (field: FieldMeta) => void;
  onDuplicateField?: (fieldId: string) => void;
  onContextMenu?: (fieldId: string, e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  columnIndex?: number;
  onFreezeUpTo?: (columnIndex: number) => void;
  isFrozen?: boolean;
}

const menuItemClass =
  'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F1F5F9] transition-colors';

export const ColumnHeader = React.memo(function ColumnHeader({
  field,
  onResize,
  onSort,
  onDelete,
  onEditField,
  onDuplicateField,
  onContextMenu,
  draggable: isDraggable,
  onDragStart,
  onDragEnd,
  columnIndex,
  onFreezeUpTo,
  isFrozen,
}: ColumnHeaderProps) {
  const Icon = getFieldTypeIcon(field.ui_type);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { sorts, setSorts, toggleHiddenField, filters, setFilters, groupByLevels, setGroupByLevels } = useDatabaseUI();
  const colors = useGridColors();

  const currentSort = sorts.find((s) => s.field_id === field.id);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = field.width || 180;

      const handleMouseMove = (ev: MouseEvent) => {
        const diff = ev.clientX - startXRef.current;
        const newWidth = Math.min(600, Math.max(80, startWidthRef.current + diff));
        onResize(field.id, newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [field.id, field.width, onResize],
  );

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleSortAsc = useCallback(() => {
    setSorts([...sorts.filter((s) => s.field_id !== field.id), { field_id: field.id, direction: 'asc' }]);
    setContextMenu(null);
  }, [field.id, sorts, setSorts]);

  const handleSortDesc = useCallback(() => {
    setSorts([...sorts.filter((s) => s.field_id !== field.id), { field_id: field.id, direction: 'desc' }]);
    setContextMenu(null);
  }, [field.id, sorts, setSorts]);

  const handleHide = useCallback(() => {
    toggleHiddenField(field.id);
    setContextMenu(null);
  }, [field.id, toggleHiddenField]);

  const handleDelete = useCallback(() => {
    if (!onDelete) return;
    const confirmed = window.confirm(`Delete field "${field.name}"? This cannot be undone.`);
    if (confirmed) onDelete(field.id);
    setContextMenu(null);
  }, [field.id, field.name, onDelete]);

  const handleEdit = useCallback(() => {
    onEditField?.(field);
    setContextMenu(null);
  }, [field, onEditField]);

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 select-none group/col"
      style={{
        width: field.width || 180,
        minWidth: field.width || 180,
        height: '100%',
        borderRight: `1px solid ${colors.border}`,
        backgroundColor: colors.headerBg,
        color: colors.muted,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onSort?.(field.id)}
      onContextMenu={handleRightClick}
      aria-sort={currentSort ? (currentSort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      {...(field.description ? { title: field.description } : {})}
    >
      <Icon size={13} className="shrink-0" style={{ color: '#9AA2AF' }} />
      <span className="truncate">{field.name}</span>
      {field.description && (
        <span className="relative shrink-0 group/info">
          <Info size={12} className="text-[#9AA2AF] hover:text-[#6A7184] cursor-help" />
          <span className="hidden group-hover/info:block absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-white dark:bg-[hsl(200,30%,12%)] shadow-lg rounded-md px-2.5 py-1.5 text-[11px] text-[#374151] dark:text-[hsl(200,25%,88%)] font-normal max-w-[200px] whitespace-normal leading-snug border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
            {field.description}
          </span>
        </span>
      )}
      {currentSort && (
        <span className="shrink-0">
          {currentSort.direction === 'asc' ? (
            <ArrowUp size={11} className="text-[#3366FF]" />
          ) : (
            <ArrowDown size={11} className="text-[#3366FF]" />
          )}
        </span>
      )}

      <div
        className="absolute right-0 top-0 h-full hover:bg-[#3366FF]"
        style={{ width: 4, cursor: 'col-resize' }}
        role="separator"
        aria-label={`Resize column ${field.name}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResize(field.id, 180);
        }}
      />

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[180px] animate-[panelSlideDown_150ms_ease-out]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={handleSortAsc}
            >
              <ArrowUp size={14} className="text-[#9AA2AF]" /> Sort A → Z
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={handleSortDesc}
            >
              <ArrowDown size={14} className="text-[#9AA2AF]" /> Sort Z → A
            </button>
            <div className="h-px bg-[#E7E7E9] dark:bg-[hsl(200,25%,18%)] my-1" />
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={() => {
                setFilters([...filters, { field_id: field.id, operator: 'isNotEmpty', value: '', conjunction: 'and' }]);
                setContextMenu(null);
              }}
            >
              <Filter size={14} className="text-[#9AA2AF]" /> Filter by this field
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={() => {
                if (!groupByLevels.some((g) => g.field_id === field.id)) {
                  setGroupByLevels([...groupByLevels, { field_id: field.id, direction: 'asc' }]);
                }
                setContextMenu(null);
              }}
            >
              <Group size={14} className="text-[#9AA2AF]" /> Group by this field
            </button>
            <div className="h-px bg-[#E7E7E9] dark:bg-[hsl(200,25%,18%)] my-1" />
            {!field.is_system && onEditField && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
                onClick={() => { onEditField(field); setContextMenu(null); }}
              >
                <Pencil size={14} className="text-[#9AA2AF]" /> Edit field
              </button>
            )}
            {!field.is_primary && !field.is_system && onDuplicateField && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
                onClick={() => { onDuplicateField(field.id); setContextMenu(null); }}
              >
                <Copy size={14} className="text-[#9AA2AF]" /> Duplicate field
              </button>
            )}
            {!field.is_system && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
                onClick={handleHide}
              >
                <EyeOff size={14} className="text-[#9AA2AF]" /> Hide field
              </button>
            )}
            {columnIndex != null && onFreezeUpTo && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
                onClick={() => {
                  onFreezeUpTo(isFrozen ? 0 : columnIndex + 1);
                  setContextMenu(null);
                }}
              >
                {isFrozen ? <Unlock size={14} className="text-[#9AA2AF]" /> : <Lock size={14} className="text-[#9AA2AF]" />}
                {isFrozen ? 'Unfreeze columns' : `Freeze up to this column`}
              </button>
            )}
            {!field.is_primary && !field.is_system && (
              <>
                <div className="h-px bg-[#E7E7E9] dark:bg-[hsl(200,25%,18%)] my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-500"
                  onClick={handleDelete}
                >
                  <Trash2 size={14} /> Delete field
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
});
