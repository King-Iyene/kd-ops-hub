import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Expand } from 'lucide-react';
import type { FieldMeta, RecordRow } from '@/features/database/types';
import { useDatabaseUI } from '../../lib/store';
import { getCellRenderer } from './cell-renderers';
import { getCellEditor } from './cell-editors';
import { useGridColors } from '../../hooks/useGridColors';
import { useUpdateField } from '../../hooks/useFields';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s+\-()]+$/;
const SINGLE_CLICK_EDIT_TYPES = new Set([
  'Attachment', 'SingleSelect', 'MultiSelect', 'Rating',
]);

function validateCellValue(uiType: string, value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  switch (uiType) {
    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent':
      if (isNaN(Number(s))) return 'Value must be a number';
      return null;
    case 'Email':
      if (!EMAIL_RE.test(s)) return 'Invalid email address';
      return null;
    case 'URL':
      try { new URL(s.includes('://') ? s : `https://${s}`); return null; }
      catch { return 'Invalid URL'; }
    case 'Date':
    case 'Year':
    case 'DateTime':
      if (isNaN(Date.parse(s))) return 'Invalid date';
      return null;
    case 'PhoneNumber':
      if (!PHONE_RE.test(s)) return 'Only digits, spaces, +, -, (, ) allowed';
      return null;
    case 'Duration': {
      const parts = s.split(':').map(Number);
      if (parts.some(isNaN) || parts.length < 1 || parts.length > 3) return 'Use h:mm or h:mm:ss format';
      return null;
    }
    case 'JSON':
      try { JSON.parse(s); return null; }
      catch { return 'Invalid JSON'; }
    default:
      return null;
  }
}

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

  const SINGLE_CLICK_EDIT_TYPES = new Set([
    'Attachment', 'SingleSelect', 'MultiSelect', 'Rating',
  ]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (field.ui_type === 'Checkbox' && !isSystemField) {
        onCellUpdate(record.id, field.id, !value);
        return;
      }
      setSelectedCell(cellId);
      if (!isSystemField && SINGLE_CLICK_EDIT_TYPES.has(field.ui_type)) {
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
        return;
      }
      if (e.key === 'Escape') {
        setSelectedCell(null);
        return;
      }
      if (
        !isSystemField &&
        field.ui_type !== 'Checkbox' &&
        field.ui_type !== 'Attachment' &&
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        setEditingCell(cellId);
      }
    },
    [isEditing, isSystemField, field.ui_type, cellId, setEditingCell, setSelectedCell],
  );

  const [validationError, setValidationError] = useState<string | null>(null);
  const updateFieldMutation = useUpdateField();

  const handleCommit = useCallback(
    (newValue: any) => {
      const error = validateCellValue(field.ui_type, newValue);
      if (error) {
        setValidationError(error);
        setTimeout(() => setValidationError(null), 2500);
        return;
      }
      setValidationError(null);
      onCellUpdate(record.id, field.id, newValue);
      setEditingCell(null);
    },
    [record.id, field.id, field.ui_type, onCellUpdate, setEditingCell],
  );

  const handleCancel = useCallback(() => {
    setEditingCell(null);
  }, [setEditingCell]);

  const handleFieldUpdate = useCallback(
    (fieldId: string, tableId: string, updates: any) => {
      updateFieldMutation.mutate({ id: fieldId, table_id: tableId, updates: { options: updates } });
    },
    [updateFieldMutation],
  );

  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && !isEditing && cellRef.current) {
      cellRef.current.focus();
    }
  }, [isSelected, isEditing]);

  const Renderer = getCellRenderer(field.ui_type);
  const Editor = getCellEditor(field.ui_type);
  const GRID_COLORS = useGridColors();

  return (
    <div
      ref={cellRef}
      className={`relative flex items-center overflow-hidden ${frozen ? 'sticky z-10' : ''}`}
      style={{
        boxSizing: 'border-box',
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
        fontSize: 14,
        lineHeight: '20px',
        color: GRID_COLORS.text,
        ...(frozen ? { left: frozenLeft, boxShadow: '4px 0 8px rgba(0,0,0,0.08)' } : {}),
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
      {validationError && (
        <div className="absolute left-0 top-full z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-red-300 rounded px-2 py-1 shadow text-[11px] text-red-600 whitespace-nowrap">
          {validationError}
        </div>
      )}
      {isEditing && Editor ? (
        <Editor
          value={value}
          field={field}
          onCommit={handleCommit}
          onCancel={handleCancel}
          onFieldUpdate={handleFieldUpdate}
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
