import React from 'react';
import { Expand, ArrowUp, ArrowDown, Copy, Trash2, Link2 } from 'lucide-react';

interface RowContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onExpand: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const itemClass =
  'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F1F5F9] transition-colors';

export function RowContextMenu({
  x,
  y,
  onClose,
  onExpand,
  onInsertAbove,
  onInsertBelow,
  onDuplicate,
  onDelete,
}: RowContextMenuProps) {
  const adjustedY = Math.min(y, window.innerHeight - 280);
  const adjustedX = Math.min(x, window.innerWidth - 240);

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-50 bg-white rounded-lg shadow-lg py-1"
        style={{
          left: adjustedX,
          top: adjustedY,
          width: 220,
          border: '1px solid #E2E8F0',
        }}
        onClick={onClose}
      >
        <button className={itemClass} style={{ color: '#0F172A' }} onClick={onExpand}>
          <Expand size={14} style={{ color: '#64748B' }} /> Expand record
        </button>

        <div className="border-t my-1" style={{ borderColor: '#E2E8F0' }} />

        <button className={itemClass} style={{ color: '#0F172A' }} onClick={onInsertAbove}>
          <ArrowUp size={14} style={{ color: '#64748B' }} /> Insert row above
        </button>
        <button className={itemClass} style={{ color: '#0F172A' }} onClick={onInsertBelow}>
          <ArrowDown size={14} style={{ color: '#64748B' }} /> Insert row below
        </button>
        <button className={itemClass} style={{ color: '#0F172A' }} onClick={onDuplicate}>
          <Copy size={14} style={{ color: '#64748B' }} /> Duplicate row
        </button>

        <div className="border-t my-1" style={{ borderColor: '#E2E8F0' }} />

        <button className={itemClass} style={{ color: '#0F172A' }}>
          <Link2 size={14} style={{ color: '#64748B' }} /> Copy row link
        </button>

        <div className="border-t my-1" style={{ borderColor: '#E2E8F0' }} />

        <button className={itemClass} style={{ color: '#DC2626' }} onClick={onDelete}>
          <Trash2 size={14} style={{ color: '#DC2626' }} /> Delete row
        </button>
      </div>
    </>
  );
}
