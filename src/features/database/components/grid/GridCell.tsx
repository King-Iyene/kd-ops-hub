import React, { useCallback } from 'react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { getCellRenderer } from './cell-renderers';
import { getCellEditor } from './cell-editors';
import { GRID_COLORS } from './grid-tokens';

interface GridCellProps {
  field: FieldMeta;
  record: RecordRow;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  /** Frozen (sticky) primary column when scrolling horizontally. */
  frozen?: boolean;
  frozenLeft?: number;
  /** Background of the parent row, so a frozen cell matches hover/selection tint. */
  rowBg?: string;
}

export const GridCell = React.memo(function GridCell({
  field,
  record,
  onCellUpdate,
  frozen,
  frozenLeft,
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
    },
    [cellId, field, record.id, value, isSystemField, onCellUpdate, setSelectedCell],
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

  return (
    <div
      className={`relative flex items-center px-2 overflow-hidden ${frozen ? 'sticky z-10' : ''}`}
      style={{
        width: field.width || 180,
        minWidth: field.width || 180,
        borderRight: `1px solid ${GRID_COLORS.border}`,
        borderBottom: `1px solid ${GRID_COLORS.border}`,
        outline: isSelected ? `2px solid ${GRID_COLORS.selected}` : 'none',
        outlineOffset: -2,
        cursor: 'default',
        fontSize: 13,
        color: GRID_COLORS.text,
        backgroundColor: frozen ? (rowBg ?? GRID_COLORS.bg) : undefined,
        ...(frozen ? { left: frozenLeft, boxShadow: '1px 0 0 0 rgba(0,0,0,0.04)' } : {}),
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isSelected ? 0 : -1}
    >
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
