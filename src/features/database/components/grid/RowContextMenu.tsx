import React, { useEffect, useRef } from 'react';
import { Expand, Copy, Link, Trash2 } from 'lucide-react';
import { RecordRow } from '../../types';

interface RowContextMenuProps {
  x: number;
  y: number;
  record: RecordRow;
  onClose: () => void;
  onExpandRow: (record: RecordRow) => void;
  onDuplicateRow: (record: RecordRow) => void;
  onDeleteRow: (recordId: string) => void;
}

export function RowContextMenu({
  x,
  y,
  record,
  onClose,
  onExpandRow,
  onDuplicateRow,
  onDeleteRow,
}: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, [x, y]);

  const handleCopyRowLink = () => {
    navigator.clipboard.writeText(record.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={menuRef}
        className="fixed rounded-lg shadow-lg"
        style={{
          left: x,
          top: y,
          minWidth: 180,
          background: '#FFFFFF',
          border: '1px solid #E7E7E9',
          fontSize: 12,
          zIndex: 51,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1">
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
            style={{ color: '#374151' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F4F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              onExpandRow(record);
              onClose();
            }}
          >
            <Expand size={14} style={{ color: '#9AA2AF' }} />
            Expand row
          </button>

          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
            style={{ color: '#374151' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F4F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              onDuplicateRow(record);
              onClose();
            }}
          >
            <Copy size={14} style={{ color: '#9AA2AF' }} />
            Duplicate row
          </button>

          <div className="my-1 border-t" style={{ borderColor: '#E7E7E9' }} />

          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
            style={{ color: '#374151' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F4F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={handleCopyRowLink}
          >
            <Link size={14} style={{ color: '#9AA2AF' }} />
            Copy row link
          </button>

          <div className="my-1 border-t" style={{ borderColor: '#E7E7E9' }} />

          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500"
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F4F5')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              onDeleteRow(record.id);
              onClose();
            }}
          >
            <Trash2 size={14} className="text-red-500" />
            Delete row
          </button>
        </div>
      </div>
    </div>
  );
}
