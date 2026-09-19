import React, { useEffect, useRef } from 'react';
import { Expand, Copy, Link, Trash2, ArrowUp, ArrowDown, ClipboardCopy } from 'lucide-react';
import { RecordRow } from '../../types';
import { confirm } from '@/hooks/use-confirm';

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
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs-plus text-[#374151] dark:text-[hsl(220,20%,88%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,20%,15%)] transition-colors focus:bg-[#F4F4F5] dark:focus:bg-[hsl(220,20%,15%)] focus:outline-none';

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

    requestAnimationFrame(() => {
      el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }, [x, y]);

  const handleCopyRowData = () => {
    const skip = new Set(['id', 'nc_order', 'created_at', 'updated_at', 'deleted_at']);
    const lines = Object.entries(record)
      .filter(([k]) => !skip.has(k) && !k.startsWith('nc_'))
      .map(([k, v]) => {
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const val = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
        return `${label}: ${val}`;
      })
      .join('\n');
    navigator.clipboard.writeText(lines).catch(() => {});
    onClose();
  };

  const handleCopyRowLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rowId', record.id);
    navigator.clipboard.writeText(url.toString()).catch(() => {});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={menuRef}
        className="fixed rounded-lg shadow-lg bg-white dark:bg-[hsl(220,20%,13%)] border border-[#E5E5E5] dark:border-[hsl(220,20%,18%)] animate-[panelSlideDown_150ms_ease-out]"
        style={{ left: x, top: y, minWidth: 200, zIndex: 51 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); return; }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
            if (!items?.length) return;
            const cur = Array.from(items).indexOf(document.activeElement as HTMLElement);
            const next = e.key === 'ArrowDown' ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
            items[next].focus();
          }
        }}
      >
        <div className="py-1" role="menu">
          <button
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              onExpandRow(record);
              onClose();
            }}
          >
            <Expand size={14} className="text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]" />
            Expand record
          </button>

          <div className="my-1 border-t border-[#E5E5E5] dark:border-[hsl(220,20%,18%)]" />

          {onInsertAbove && (
            <button
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onInsertAbove(record);
                onClose();
              }}
            >
              <ArrowUp size={14} className="text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]" />
              Insert record above
            </button>
          )}

          {onInsertBelow && (
            <button
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onInsertBelow(record);
                onClose();
              }}
            >
              <ArrowDown size={14} className="text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]" />
              Insert record below
            </button>
          )}

          <button
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              onDuplicateRow(record);
              onClose();
            }}
          >
            <Copy size={14} className="text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]" />
            Duplicate record
          </button>

          <div className="my-1 border-t border-[#E5E5E5] dark:border-[hsl(220,20%,18%)]" />

          <button role="menuitem" className={menuItemClass} onClick={handleCopyRowData}>
            <ClipboardCopy size={14} className="text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]" />
            Copy row data
          </button>

          <button role="menuitem" className={menuItemClass} onClick={handleCopyRowLink}>
            <Link size={14} className="text-[#9AA2AF] dark:text-[hsl(220,15%,55%)]" />
            Copy record URL
          </button>

          <div className="my-1 border-t border-[#E5E5E5] dark:border-[hsl(220,20%,18%)]" />

          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs-plus text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:bg-red-50 dark:focus:bg-red-900/20 focus:outline-none"
            onClick={async () => {
              onClose();
              const confirmed = await confirm({ description: 'Are you sure you want to delete this record? This action cannot be undone.', variant: 'destructive' });
              if (confirmed) {
                onDeleteRow(record.id);
              }
            }}
          >
            <Trash2 size={14} className="text-red-500" />
            Move to trash
          </button>
        </div>
      </div>
    </div>
  );
}
