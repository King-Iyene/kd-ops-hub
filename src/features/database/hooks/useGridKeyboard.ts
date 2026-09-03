import { useEffect, useCallback } from 'react';
import { useDatabaseUI } from '../lib/store';
import { useUndoStore } from '../lib/undo';
import type { FieldMeta, RecordRow } from '../types';

const SINGLE_CLICK_EDIT_TYPES = new Set([
  'Attachment', 'SingleSelect', 'MultiSelect', 'Rating',
]);

const CHECKBOX_TYPE = 'Checkbox';

interface UseGridKeyboardOptions {
  records: RecordRow[];
  fields: (FieldMeta & { width: number })[];
  onCellUpdate: (recordId: string, fieldId: string, value: unknown) => void;
  onExpandRow?: (record: RecordRow) => void;
  onAddRow: () => void;
  onPasteRows?: (rows: Record<string, unknown>[]) => void;
  selectedRowIds: Set<string>;
  copySelectedRows: () => void;
  copyRange: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  cellToText: (value: unknown) => string;
  showToast: (msg: string) => void;
  flashCellIds: (ids: string[]) => void;
  selectionRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  setSelectionRange: (range: { startRow: number; startCol: number; endRow: number; endCol: number } | null) => void;
  selectionAnchor: { row: number; col: number } | null;
  setSelectionAnchor: (anchor: { row: number; col: number } | null) => void;
  coerceValue: (val: string, field: FieldMeta) => unknown;
}

export function useGridKeyboard({
  records,
  fields,
  onCellUpdate,
  onExpandRow,
  onAddRow,
  onPasteRows,
  selectedRowIds,
  copySelectedRows,
  copyRange,
  cellToText,
  showToast,
  flashCellIds,
  selectionRange,
  setSelectionRange,
  selectionAnchor,
  setSelectionAnchor,
  coerceValue,
}: UseGridKeyboardOptions) {
  const selectedCellId = useDatabaseUI((s) => s.selectedCellId);
  const editingCellId = useDatabaseUI((s) => s.editingCellId);
  const setSelectedCell = useDatabaseUI((s) => s.setSelectedCell);
  const setEditingCell = useDatabaseUI((s) => s.setEditingCell);

  const navigateTo = useCallback(
    (rowIdx: number, colIdx: number) => {
      if (rowIdx < 0 || rowIdx >= records.length) return;
      if (colIdx < 0 || colIdx >= fields.length) return;
      const cellId = `${records[rowIdx].id}:${fields[colIdx].id}`;
      setSelectedCell(cellId);
    },
    [records, fields, setSelectedCell],
  );

  const commitAndMove = useCallback(
    (direction: 'down' | 'right' | 'left') => {
      if (!selectedCellId) return;
      const [rowId, fieldId] = selectedCellId.split(':');
      const rowIdx = records.findIndex((r) => r.id === rowId);
      const colIdx = fields.findIndex((f) => f.id === fieldId);
      if (rowIdx === -1 || colIdx === -1) return;

      setEditingCell(null);

      if (direction === 'down') {
        navigateTo(Math.min(records.length - 1, rowIdx + 1), colIdx);
      } else if (direction === 'right') {
        let nextCol = colIdx + 1;
        let nextRow = rowIdx;
        if (nextCol >= fields.length) {
          nextCol = 0;
          nextRow = Math.min(records.length - 1, rowIdx + 1);
        }
        navigateTo(nextRow, nextCol);
      } else if (direction === 'left') {
        let nextCol = colIdx - 1;
        let nextRow = rowIdx;
        if (nextCol < 0) {
          nextCol = fields.length - 1;
          nextRow = Math.max(0, rowIdx - 1);
        }
        navigateTo(nextRow, nextCol);
      }
    },
    [selectedCellId, records, fields, setEditingCell, navigateTo],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { undo, redo } = useUndoStore.getState();

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        if (selectedRowIds.size > 0) {
          copySelectedRows();
          return;
        }
        if (selectionRange) {
          copyRange(selectionRange);
          return;
        }
        if (selectedCellId) {
          const [, fId] = selectedCellId.split(':');
          const rIdx = records.findIndex((r) => r.id === selectedCellId.split(':')[0]);
          const f = fields.find((ff) => ff.id === fId);
          if (rIdx !== -1 && f) {
            const text = cellToText(records[rIdx][f.pg_column_name]);
            navigator.clipboard.writeText(text).catch(() => {});
            showToast('1 cell copied');
          }
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        if (selectedCellId) {
          const [cutRowId, cutFieldId] = selectedCellId.split(':');
          const cutRowIdx = records.findIndex((r) => r.id === cutRowId);
          const cutField = fields.find((f) => f.id === cutFieldId);
          if (cutRowIdx !== -1 && cutField) {
            const text = cellToText(records[cutRowIdx][cutField.pg_column_name]);
            navigator.clipboard.writeText(text).catch(() => {});
            onCellUpdate(cutRowId, cutFieldId, null);
            showToast('Cell cut');
          }
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().catch(() => '').then((pastedText) => {
          if (!pastedText) return;
          const lines = pastedText.split('\n').filter((l) => l.length > 0);
          const isMultiLine = lines.length > 1 || (lines.length === 1 && lines[0].includes('\t'));
          const hasTabSep = lines.some((l) => l.includes('\t'));

          if (isMultiLine && hasTabSep && !selectedCellId && onPasteRows) {
            const newRows: Record<string, unknown>[] = [];
            for (const line of lines) {
              const cols = line.split('\t');
              const rec: Record<string, unknown> = {};
              cols.forEach((val, ci) => {
                const field = fields[ci];
                if (field) {
                  rec[field.pg_column_name] = coerceValue(val, field);
                }
              });
              newRows.push(rec);
            }
            onPasteRows(newRows);
            showToast(`${newRows.length} row${newRows.length !== 1 ? 's' : ''} pasted`);
            return;
          }

          if (isMultiLine && selectedCellId) {
            const [startRowId] = selectedCellId.split(':');
            const startRowIdx = records.findIndex((r) => r.id === startRowId);
            const startColIdx = fields.findIndex((f) => f.id === selectedCellId.split(':')[1]);
            if (startRowIdx === -1 || startColIdx === -1) return;
            const flashIds: string[] = [];
            let cellCount = 0;
            lines.forEach((line, li) => {
              const rowIdx = startRowIdx + li;
              if (rowIdx >= records.length) return;
              const cols = line.split('\t');
              cols.forEach((val, ci) => {
                const colIdx = startColIdx + ci;
                if (colIdx >= fields.length) return;
                const field = fields[colIdx];
                const rec = records[rowIdx];
                const coerced = coerceValue(val, field);
                onCellUpdate(rec.id, field.id, coerced);
                flashIds.push(`${rec.id}:${field.id}`);
                cellCount++;
              });
            });
            flashCellIds(flashIds);
            showToast(`${cellCount} cell${cellCount !== 1 ? 's' : ''} pasted`);
            return;
          }

          if (selectedCellId) {
            const [rowId, fieldId] = selectedCellId.split(':');
            const field = fields.find((f) => f.id === fieldId);
            if (field) {
              const coerced = coerceValue(pastedText.trim(), field);
              onCellUpdate(rowId, fieldId, coerced);
              flashCellIds([selectedCellId]);
              showToast('1 cell pasted');
            }
          }
        });
        return;
      }

      if (!selectedCellId) return;

      if (editingCellId && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown')) return;

      if (editingCellId && e.key === 'Tab') {
        e.preventDefault();
        commitAndMove(e.shiftKey ? 'left' : 'right');
        return;
      }

      if (editingCellId && e.key === 'Enter') {
        e.preventDefault();
        commitAndMove('down');
        return;
      }

      if (editingCellId && e.key === 'Escape') {
        e.preventDefault();
        setEditingCell(null);
        return;
      }

      if (editingCellId) return;

      const [rowId, fieldId] = selectedCellId.split(':');
      const rowIdx = records.findIndex((r) => r.id === rowId);
      const colIdx = fields.findIndex((f) => f.id === fieldId);
      if (rowIdx === -1 || colIdx === -1) return;

      const field = fields[colIdx];
      const isSystemField =
        field.ui_type === 'ID' ||
        field.ui_type === 'CreatedTime' ||
        field.ui_type === 'LastModifiedTime' ||
        field.ui_type === 'CreatedBy' ||
        field.ui_type === 'LastModifiedBy' ||
        field.is_system;

      let nextRow = rowIdx;
      let nextCol = colIdx;

      if (e.key === 'ArrowUp') {
        nextRow = Math.max(0, rowIdx - 1);
      } else if (e.key === 'ArrowDown') {
        nextRow = Math.min(records.length - 1, rowIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        nextCol = Math.max(0, colIdx - 1);
      } else if (e.key === 'ArrowRight') {
        nextCol = Math.min(fields.length - 1, colIdx + 1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitAndMove(e.shiftKey ? 'left' : 'right');
        return;
      } else if (e.key === 'Home') {
        if (e.ctrlKey || e.metaKey) { nextRow = 0; nextCol = 0; }
        else { nextCol = 0; }
      } else if (e.key === 'End') {
        if (e.ctrlKey || e.metaKey) { nextRow = records.length - 1; nextCol = fields.length - 1; }
        else { nextCol = fields.length - 1; }
      } else if (e.key === 'PageUp') {
        nextRow = Math.max(0, rowIdx - 20);
      } else if (e.key === 'PageDown') {
        nextRow = Math.min(records.length - 1, rowIdx + 20);
      } else if (e.key === 'Escape') {
        setSelectedCell(null);
        setEditingCell(null);
        setSelectionRange(null);
        setSelectionAnchor(null);
        return;
      } else if (e.key === ' ') {
        e.preventDefault();
        if (field.ui_type === CHECKBOX_TYPE && !isSystemField) {
          const record = records[rowIdx];
          const currentVal = record[field.pg_column_name];
          onCellUpdate(record.id, field.id, !currentVal);
          return;
        }
        onExpandRow?.(records[rowIdx]);
        return;
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        onAddRow();
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!isSystemField && field.ui_type !== CHECKBOX_TYPE) {
          setEditingCell(selectedCellId);
        }
        return;
      } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (rowIdx > 0) {
          const aboveRecord = records[rowIdx - 1];
          const valueAbove = aboveRecord[field.pg_column_name];
          if (valueAbove !== undefined) {
            onCellUpdate(rowId, fieldId, valueAbove);
          }
        }
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (!isSystemField) {
          onCellUpdate(rowId, fieldId, null);
        }
        return;
      } else if (
        e.key.length === 1 &&
        !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        if (!isSystemField && field.ui_type !== CHECKBOX_TYPE) {
          setEditingCell(selectedCellId);
        }
        return;
      } else {
        return;
      }

      e.preventDefault();

      if (e.shiftKey && e.key.startsWith('Arrow')) {
        const anchor = selectionAnchor ?? { row: rowIdx, col: colIdx };
        if (!selectionAnchor) setSelectionAnchor(anchor);
        setSelectionRange({
          startRow: anchor.row,
          startCol: anchor.col,
          endRow: nextRow,
          endCol: nextCol,
        });
      } else {
        setSelectionRange(null);
        setSelectionAnchor(null);
      }

      navigateTo(nextRow, nextCol);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedCellId, editingCellId, records, fields,
    setSelectedCell, setEditingCell, onCellUpdate,
    selectedRowIds, selectionRange, selectionAnchor,
    copySelectedRows, copyRange, cellToText, showToast,
    flashCellIds, onPasteRows, onExpandRow, onAddRow,
    navigateTo, commitAndMove, setSelectionRange, setSelectionAnchor,
    coerceValue,
  ]);
}
