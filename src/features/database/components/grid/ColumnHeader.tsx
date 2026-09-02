import React, { useCallback, useRef, useState } from 'react';
import type { FieldMeta } from '@/features/database/types';
import { getFieldTypeIcon } from './field-icons';

interface ColumnHeaderProps {
  field: FieldMeta;
  onResize: (fieldId: string, width: number) => void;
  onSort?: (fieldId: string) => void;
  onContextMenu?: (fieldId: string, e: React.MouseEvent) => void;
}

export const ColumnHeader = React.memo(function ColumnHeader({
  field,
  onResize,
  onSort,
  onContextMenu,
}: ColumnHeaderProps) {
  const Icon = getFieldTypeIcon(field.ui_type);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 select-none"
      style={{
        width: field.width || 180,
        minWidth: field.width || 180,
        height: '100%',
        borderRight: '1px solid #E2E8F0',
        backgroundColor: '#F8FAFC',
        color: '#475569',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
      }}
      onClick={() => onSort?.(field.id)}
      onContextMenu={handleRightClick}
    >
      <Icon size={14} className="shrink-0" style={{ color: '#94A3B8' }} />
      <span className="truncate">{field.name}</span>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full hover:bg-blue-400"
        style={{ width: 4, cursor: 'col-resize' }}
        onMouseDown={handleMouseDown}
      />

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-white border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              borderColor: '#E2E8F0',
            }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              style={{ color: '#0F172A' }}
              onClick={() => setContextMenu(null)}
            >
              Edit field
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              style={{ color: '#0F172A' }}
              onClick={() => setContextMenu(null)}
            >
              Hide field
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              style={{ color: '#DC2626' }}
              onClick={() => setContextMenu(null)}
            >
              Delete field
            </button>
          </div>
        </>
      )}
    </div>
  );
});
