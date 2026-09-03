import React, { useCallback } from 'react';
import { Expand } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { getCellRenderer } from './cell-renderers';
import { getCellEditor } from './cell-editors';
import { useGridColors } from '../../hooks/useGridColors';

interface GridCellProps {
  field: FieldMeta;
  record: RecordRow;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  backgroundColor?: string;
  frozen?: boolean;
  frozenLeft?: number;
  rowBg?: string;
}

export const GridCell = React.memo(function GridCell({
  field,
  record,
  onCellUpdate,
  backgroundColor,
  frozen = false,
  frozenLeft = 0,
  rowBg,
}: GridCellProps) {
  const selectedCellId = useDatabaseUI((s) => s.selectedCellId);
  const editingCellId = useDatabaseUI((s) => s.editingCellId);
  const setSelectedCell = useDatabaseUI((s) => s.setSelectedCell);
  const setEditingCell = useDatabaseUI((s) => s.setEditingCell);
  const rowHeight = useDatabaseUI((s) => s.rowHeight);

  const cellId = `${record.id}:${field.id}`;
  const isSelected = selectedCellId === cellId;
  const isEditing = editingCellId === cellId;
  const value = record[field.pg_column_name];

  const isSystemField =
    field.ui_type === 'ID' ||
    field.ui_type === 'CreatedTime' ||
    field.ui_type === 'LastModifiedTime' ||
    field.ui_type === 'CreatedBy' ||
    field.ui_type === 'LastModifiedBy' ||
    field.is_system;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (field.ui_type === 'Checkbox' && !isSystemField) {
        onCellUpdate(record.id, field.id, !value);
        return;
      }
      setSelectedCell(cellId);
      if (field.ui_type === 'Attachment' && !isSystemField) {
        setEditingCell(cellId);
      }
    },
    [cellId, field, record.id, value, isSystemField, onCellUpdate, setSelectedCell, setEditingCell],
  );

  const handleDoubleClick = useCallback(() => {
    if (isSystemField) return;
    if (field.ui_type === 'Checkbox') return;
    setEditingCell(cellId);
  }, [cellId, isSystemField, field.ui_type, setEditingCell]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing) return;
      if (e.key === 'Enter' && !isSystemField && field.ui_type !== 'Checkbox') {
        e.preventDefault();
        setEditingCell(cellId);
      }
      if (e.key === 'Escape') {
        setSelectedCell(null);
      }
    },
    [isEditing, isSystemField, field.ui_type, cellId, setEditingCell, setSelectedCell],
  );

  const handleCommit = useCallback(
    (newValue: any) => {
      onCellUpdate(record.id, field.id, newValue);
      setEditingCell(null);
    },
    [record.id, field.id, onCellUpdate, setEditingCell],
  );

  const handleCancel = useCallback(() => {
    setEditingCell(null);
  }, [setEditingCell]);

  const Renderer = getCellRenderer(field.ui_type);
  const Editor = getCellEditor(field.ui_type);
  const GRID_COLORS = useGridColors();

  return (
    <div
      className={`relative flex items-center overflow-hidden ${frozen ? 'sticky z-10' : ''}`}
      style={{
        width: field.width || 180,
        minWidth: field.width || 180,
        height: '100%',
        padding: '0 8px',
        borderRight: `1px solid ${GRID_COLORS.border}`,
        borderBottom: `1px solid ${GRID_COLORS.border}`,
        backgroundColor: frozen ? (rowBg ?? GRID_COLORS.bg) : (backgroundColor || (isSystemField ? GRID_COLORS.headerBg : undefined)),
        outline: isSelected ? `2px solid ${GRID_COLORS.primary}` : 'none',
        outlineOffset: -2,
        cursor: isSystemField ? 'default' : 'cell',
        fontSize: 13,
        lineHeight: '20px',
        color: GRID_COLORS.text,
        ...(frozen ? { left: frozenLeft, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' } : {}),
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isSelected ? 0 : -1}
    >
      {field.is_primary && !isEditing && (
        <span
          className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity mr-1 cursor-pointer"
          style={{ color: GRID_COLORS.muted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = GRID_COLORS.primary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = GRID_COLORS.muted)}
          onClick={(e) => {
            e.stopPropagation();
            const expandEvent = new CustomEvent('grid:expand-row', { detail: record });
            window.dispatchEvent(expandEvent);
          }}
        >
          <Expand size={12} />
        </span>
      )}
      {isEditing && Editor ? (
        <Editor
          value={value}
          field={field}
          onCommit={handleCommit}
          onCancel={handleCancel}
        />
      ) : (
        <Renderer
          value={value}
          field={field}
          record={record}
          rowHeight={rowHeight}
        />
      )}
    </div>
  );
});
