import React, { useEffect, useRef } from 'react';
import { Expand, Copy, Link, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { RecordRow } from '../../types';

interface RowContextMenuProps {
  x: number;
  y: number;
  record: RecordRow;
  onClose: () => void;
  onExpandRow: (record: RecordRow) => void;
  onDuplicateRow: (record: RecordRow) => void;
  onDeleteRow: (recordId: string) => void;
  onInsertAbove?: (record: RecordRow) => void;
  onInsertBelow?: (record: RecordRow) => void;
}

const menuItemClass =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[#374151] dark:text-[hsl(200,25%,88%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] transition-colors';

export function RowContextMenu({
  x,
  y,
  record,
  onClose,
  onExpandRow,
  onDuplicateRow,
  onDeleteRow,
  onInsertAbove,
  onInsertBelow,
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
    navigator.clipboard.writeText(record.id).catch(() => {});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={menuRef}
        className="fixed rounded-lg shadow-lg bg-white dark:bg-[hsl(200,25%,13%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] animate-[panelSlideDown_150ms_ease-out]"
        style={{ left: x, top: y, minWidth: 200, zIndex: 51 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1">
          <button
            className={menuItemClass}
            onClick={() => {
              onExpandRow(record);
              onClose();
            }}
          >
            <Expand size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
            Expand record
          </button>

          <div className="my-1 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]" />

          {onInsertAbove && (
            <button
              className={menuItemClass}
              onClick={() => {
                onInsertAbove(record);
                onClose();
              }}
            >
              <ArrowUp size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
              Insert record above
            </button>
          )}

          {onInsertBelow && (
            <button
              className={menuItemClass}
              onClick={() => {
                onInsertBelow(record);
                onClose();
              }}
            >
              <ArrowDown size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
              Insert record below
            </button>
          )}

          <button
            className={menuItemClass}
            onClick={() => {
              onDuplicateRow(record);
              onClose();
            }}
          >
            <Copy size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
            Duplicate record
          </button>

          <div className="my-1 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]" />

          <button className={menuItemClass} onClick={handleCopyRowLink}>
            <Link size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
            Copy record URL
          </button>

          <div className="my-1 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]" />

          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            onClick={() => {
              onDeleteRow(record.id);
              onClose();
            }}
          >
            <Trash2 size={14} className="text-red-500" />
            Delete record
          </button>
        </div>
      </div>
    </div>
  );
}
