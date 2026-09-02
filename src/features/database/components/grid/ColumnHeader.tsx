import React, { useCallback, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Filter, EyeOff, Trash2, Plus, Info } from 'lucide-react';
import type { FieldMeta } from '@/features/database/types';
import { getFieldTypeIcon } from './field-icons';
import { useDatabaseUI } from '../../lib/store';
import { GRID_COLORS } from './grid-tokens';

interface ColumnHeaderProps {
  field: FieldMeta;
  onResize: (fieldId: string, width: number) => void;
  onDeleteField?: (fieldId: string) => void;
  onDragStart?: (fieldId: string) => void;
  onDragOver?: (fieldId: string) => void;
  onDrop?: (fieldId: string) => void;
  /** Frozen (sticky) primary column when scrolling horizontally. */
  frozen?: boolean;
  frozenLeft?: number;
}

const menuItemClass =
  'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F1F5F9] transition-colors';

export const ColumnHeader = React.memo(function ColumnHeader({
  field,
  onResize,
  onDeleteField,
  onDragStart,
  onDragOver,
  onDrop,
  frozen,
  frozenLeft,
}: ColumnHeaderProps) {
  const Icon = getFieldTypeIcon(field.ui_type);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { setSorts, sorts, toggleHiddenField } = useDatabaseUI();

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
    if (!onDeleteField) return;
    const confirmed = window.confirm(`Delete field "${field.name}"? This cannot be undone.`);
    if (confirmed) onDeleteField(field.id);
    setContextMenu(null);
  }, [field.id, field.name, onDeleteField]);

  return (
    <div
      className={`relative flex items-center gap-1.5 px-2 select-none group ${frozen ? 'sticky z-20' : ''}`}
      style={{
        width: field.width || 180,
        minWidth: field.width || 180,
        height: '100%',
        borderRight: `1px solid ${GRID_COLORS.border}`,
        backgroundColor: GRID_COLORS.headerBg,
        color: GRID_COLORS.headerText,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        ...(frozen ? { left: frozenLeft, boxShadow: '1px 0 0 0 rgba(0,0,0,0.04)' } : {}),
      }}
      draggable={!frozen}
      onDragStart={() => onDragStart?.(field.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(field.id); }}
      onDrop={() => onDrop?.(field.id)}
      onContextMenu={handleRightClick}
      {...(field.description ? { title: field.description } : {})}
    >
      <Icon size={14} className="shrink-0" style={{ color: GRID_COLORS.muted }} />
      <span className="truncate">{field.name}</span>
      {field.description && (
        <Info size={10} className="shrink-0" style={{ color: GRID_COLORS.muted }} />
      )}

      <div
        className="absolute right-0 top-0 h-full opacity-0 group-hover:opacity-100"
        style={{ width: 4, cursor: 'col-resize', backgroundColor: GRID_COLORS.selected }}
        onMouseDown={handleMouseDown}
      />

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg py-1"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 260),
              width: 220,
              border: `1px solid ${GRID_COLORS.border}`,
            }}
          >
            <button className={menuItemClass} style={{ color: '#0F172A' }} onClick={handleSortAsc}>
              <ArrowDownAZ size={14} style={{ color: '#64748B' }} /> Sort A → Z
            </button>
            <button className={menuItemClass} style={{ color: '#0F172A' }} onClick={handleSortDesc}>
              <ArrowUpAZ size={14} style={{ color: '#64748B' }} /> Sort Z → A
            </button>

            <div className="border-t my-1" style={{ borderColor: GRID_COLORS.border }} />

            <button className={menuItemClass} style={{ color: '#0F172A' }} onClick={handleHide}>
              <EyeOff size={14} style={{ color: '#64748B' }} /> Hide field
            </button>

            <div className="border-t my-1" style={{ borderColor: GRID_COLORS.border }} />

            {!field.is_system && (
              <button className={menuItemClass} style={{ color: '#DC2626' }} onClick={handleDelete}>
                <Trash2 size={14} style={{ color: '#DC2626' }} /> Delete field
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
});
