import React, { useCallback, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, EyeOff, Pencil, Trash2, Copy, ArrowLeftRight, Info } from 'lucide-react';
import type { FieldMeta } from '@/features/database/types';
import { getFieldTypeIcon } from './field-icons';
import { useDatabaseUI } from '../../lib/store';

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
}

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
}: ColumnHeaderProps) {
  const Icon = getFieldTypeIcon(field.ui_type);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { sorts, setSorts, toggleHiddenField } = useDatabaseUI();

  const currentSort = sorts.find((s) => s.field_id === field.id);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = field.width || 180;

      const handleMouseMove = (ev: MouseEvent) => {
        const diff = ev.clientX - startXRef.current;
        const newWidth = Math.max(60, startWidthRef.current + diff);
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

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (onContextMenu) {
        onContextMenu(field.id, e);
      } else {
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [field.id, onContextMenu],
  );

  const handleSortAsc = useCallback(() => {
    const newSorts = sorts.filter((s) => s.field_id !== field.id);
    newSorts.push({ field_id: field.id, direction: 'asc' });
    setSorts(newSorts);
    setContextMenu(null);
  }, [field.id, sorts, setSorts]);

  const handleSortDesc = useCallback(() => {
    const newSorts = sorts.filter((s) => s.field_id !== field.id);
    newSorts.push({ field_id: field.id, direction: 'desc' });
    setSorts(newSorts);
    setContextMenu(null);
  }, [field.id, sorts, setSorts]);

  const handleHide = useCallback(() => {
    toggleHiddenField(field.id);
    setContextMenu(null);
  }, [field.id, toggleHiddenField]);

  const handleDelete = useCallback(() => {
    if (field.is_primary || field.is_system) return;
    if (!confirm(`Delete field "${field.name}"?`)) return;
    onDelete?.(field.id);
    setContextMenu(null);
  }, [field, onDelete]);

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 select-none group/col"
      style={{
        width: field.width || 180,
        minWidth: field.width || 180,
        height: '100%',
        borderRight: '1px solid #E7E7E9',
        backgroundColor: '#F9F9FA',
        color: '#6A7184',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onSort?.(field.id)}
      onContextMenu={handleRightClick}
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

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full hover:bg-[#3366FF]"
        style={{ width: 3, cursor: 'col-resize' }}
        onMouseDown={handleMouseDown}
      />

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={handleSortAsc}
            >
              <ArrowUp size={14} className="text-[#9AA2AF]" /> Sort ascending
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={handleSortDesc}
            >
              <ArrowDown size={14} className="text-[#9AA2AF]" /> Sort descending
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
