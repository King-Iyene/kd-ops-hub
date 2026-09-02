import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, ChevronLeft, ChevronRight, Loader2, Expand, Copy, Trash2, MoreHorizontal, Sigma, Lock } from 'lucide-react';
import type { FieldMeta, RecordRow, RowColorRule, UIType, ConditionalFormatRule } from '@/features/database/types';
import { useDatabaseUI, type SummaryFunction } from '../../lib/store';
import { useUndoStore } from '../../lib/undo';
import { ColumnHeader } from './ColumnHeader';
import { GridCell } from './GridCell';
import { EditFieldDialog } from '../EditFieldDialog';
import { BulkActionsBar } from './BulkActionsBar';

export interface GridViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: () => void;
  onAddField: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onExpandRow?: (record: RecordRow) => void;
  onDeleteRow?: (recordId: string) => void;
  onDuplicateRow?: (record: RecordRow) => void;
  onDeleteField?: (fieldId: string) => void;
  onDuplicateField?: (fieldId: string) => void;
  onBulkDeleteRows?: (recordIds: string[]) => void;
  onReorderFields?: (fieldIds: string[]) => void;
}

const ROW_HEIGHTS: Record<string, number> = {
  compact: 32,
  default: 44,
  tall: 64,
  'extra-tall': 88,
};

const ROW_NUMBER_WIDTH = 64;
const HEADER_HEIGHT = 36;

const NUMERIC_TYPES: UIType[] = ['Number', 'Decimal', 'Currency', 'Percent', 'Rating', 'Duration'];

const SUMMARY_OPTIONS: { value: SummaryFunction; label: string; numericOnly: boolean }[] = [
  { value: 'none', label: 'None', numericOnly: false },
  { value: 'sum', label: 'Sum', numericOnly: true },
  { value: 'avg', label: 'Average', numericOnly: true },
  { value: 'min', label: 'Min', numericOnly: true },
  { value: 'max', label: 'Max', numericOnly: true },
  { value: 'count', label: 'Count all', numericOnly: false },
  { value: 'countEmpty', label: 'Count empty', numericOnly: false },
  { value: 'countFilled', label: 'Count filled', numericOnly: false },
  { value: 'percentEmpty', label: '% Empty', numericOnly: false },
  { value: 'percentFilled', label: '% Filled', numericOnly: false },
];

const SUMMARY_LABELS: Record<SummaryFunction, string> = {
  none: '', sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max',
  count: 'Count', countEmpty: 'Empty', countFilled: 'Filled',
  percentEmpty: '% Empty', percentFilled: '% Filled',
};

function computeSummary(
  fn: SummaryFunction,
  records: RecordRow[],
  pgCol: string,
): string {
  if (fn === 'none') return '';
  const total = records.length;
  if (total === 0) return '';

  if (fn === 'count') return total.toLocaleString();

  const values = records.map((r) => r[pgCol]);
  const filledCount = values.filter((v) => v != null && v !== '').length;
  const emptyCount = total - filledCount;

  if (fn === 'countEmpty') return emptyCount.toLocaleString();
  if (fn === 'countFilled') return filledCount.toLocaleString();
  if (fn === 'percentEmpty') return (total > 0 ? ((emptyCount / total) * 100).toFixed(1) + '%' : '0%');
  if (fn === 'percentFilled') return (total > 0 ? ((filledCount / total) * 100).toFixed(1) + '%' : '0%');

  const nums = values.map((v) => (typeof v === 'number' ? v : parseFloat(String(v)))).filter((n) => !isNaN(n));
  if (nums.length === 0) return '';

  if (fn === 'sum') return nums.reduce((a, b) => a + b, 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (fn === 'avg') return (nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (fn === 'min') return Math.min(...nums).toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (fn === 'max') return Math.max(...nums).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return '';
}

export function evaluateCondition(
  record: RecordRow,
  rule: ConditionalFormatRule,
  fields: FieldMeta[],
): boolean {
  const field = fields.find((f) => f.id === rule.field_id);
  if (!field) return false;
  const val = record[field.pg_column_name];
  const strVal = val == null ? '' : String(val);
  const ruleVal = rule.value == null ? '' : String(rule.value);
  switch (rule.operator) {
    case 'is':
      return strVal === ruleVal;
    case 'isNot':
      return strVal !== ruleVal;
    case 'contains':
      return strVal.toLowerCase().includes(ruleVal.toLowerCase());
    case 'doesNotContain':
      return !strVal.toLowerCase().includes(ruleVal.toLowerCase());
    case 'isEmpty':
      return val == null || strVal === '';
    case 'isNotEmpty':
      return val != null && strVal !== '';
    case 'gt':
      return parseFloat(strVal) > parseFloat(ruleVal);
    case 'lt':
      return parseFloat(strVal) < parseFloat(ruleVal);
    case 'gte':
      return parseFloat(strVal) >= parseFloat(ruleVal);
    case 'lte':
      return parseFloat(strVal) <= parseFloat(ruleVal);
    default:
      return false;
  }
}

function SummaryRow({
  fields,
  records,
  summaryFunctions,
  setSummaryFunction,
  summaryDropdown,
  setSummaryDropdown,
  rowNumberWidth,
  frozenCount = 0,
}: {
  fields: (FieldMeta & { width: number })[];
  records: RecordRow[];
  summaryFunctions: Record<string, SummaryFunction>;
  setSummaryFunction: (fieldId: string, fn: SummaryFunction) => void;
  summaryDropdown: string | null;
  setSummaryDropdown: (id: string | null) => void;
  rowNumberWidth: number;
  frozenCount?: number;
}) {
  return (
    <div
      className="flex"
      style={{
        backgroundColor: '#F9F9FA',
        borderTop: '2px solid #E7E7E9',
        borderBottom: '1px solid #E7E7E9',
        minHeight: 40,
      }}
    >
      {/* Sigma icon cell */}
      <div
        className="sticky left-0 z-10 flex items-center justify-center shrink-0"
        style={{
          width: rowNumberWidth,
          minWidth: rowNumberWidth,
          backgroundColor: '#F9F9FA',
          borderRight: '1px solid #E7E7E9',
          color: '#9AA2AF',
        }}
      >
        <Sigma size={14} />
      </div>

      {fields.map((field, colIdx) => {
        const fn = summaryFunctions[field.id] || 'none';
        const isNumeric = NUMERIC_TYPES.includes(field.ui_type);
        const value = computeSummary(fn, records, field.pg_column_name);
        const label = SUMMARY_LABELS[fn];
        const isOpen = summaryDropdown === field.id;
        const isFroz = colIdx < frozenCount;
        const isLastFroz = colIdx === frozenCount - 1;
        let cellLeft = rowNumberWidth;
        if (isFroz) {
          for (let i = 0; i < colIdx; i++) cellLeft += fields[i].width;
        }

        return (
          <div
            key={field.id}
            className="relative shrink-0"
            style={{
              width: field.width,
              minWidth: field.width,
              borderRight: isLastFroz ? '3px solid #D0D0D4' : '1px solid #E7E7E9',
              backgroundColor: '#F9F9FA',
              ...(isFroz ? { position: 'sticky' as const, left: cellLeft, zIndex: 10 } : {}),
            }}
          >
            <button
              className="w-full h-full flex flex-col justify-center px-2 text-left hover:bg-gray-100"
              style={{ minHeight: 40 }}
              onClick={() => setSummaryDropdown(isOpen ? null : field.id)}
            >
              {fn !== 'none' ? (
                <>
                  <span style={{ fontSize: 10, color: '#9AA2AF', lineHeight: '14px' }}>{label}</span>
                  <span style={{ fontSize: 12, color: '#374151', lineHeight: '16px', fontWeight: 500 }}>{value}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: '#9AA2AF' }}>&#8211;</span>
              )}
            </button>

            {isOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSummaryDropdown(null)} />
                <div
                  className="absolute left-0 bottom-full z-50 bg-white border border-[#E7E7E9] rounded-lg shadow-lg py-1 min-w-[150px]"
                  style={{ marginBottom: 2 }}
                >
                  {SUMMARY_OPTIONS.filter((opt) => !opt.numericOnly || isNumeric).map((opt) => (
                    <button
                      key={opt.value}
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center justify-between"
                      style={{ color: '#374151' }}
                      onClick={() => {
                        setSummaryFunction(field.id, opt.value);
                        setSummaryDropdown(null);
                      }}
                    >
                      <span>{opt.label}</span>
                      {fn === opt.value && <span style={{ color: '#3366FF' }}>&#10003;</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GridView({
  fields,
  records,
  totalCount,
  isLoading,
  onCellUpdate,
  onAddRow,
  onAddField,
  page,
  pageSize,
  onPageChange,
  onExpandRow,
  onDeleteRow,
  onDuplicateRow,
  onDeleteField,
  onDuplicateField,
  onBulkDeleteRows,
  onReorderFields,
}: GridViewProps) {
  const rowHeight = useDatabaseUI((s) => s.rowHeight);
  const selectedCellId = useDatabaseUI((s) => s.selectedCellId);
  const setSelectedCell = useDatabaseUI((s) => s.setSelectedCell);
  const setEditingCell = useDatabaseUI((s) => s.setEditingCell);
  const rowColorRules = useDatabaseUI((s) => s.rowColorRules);
  const conditionalFormats = useDatabaseUI((s) => s.conditionalFormats);
  const summaryFunctions = useDatabaseUI((s) => s.summaryFunctions);
  const setSummaryFunction = useDatabaseUI((s) => s.setSummaryFunction);
  const fieldOrder = useDatabaseUI((s) => s.fieldOrder);
  const fieldWidths = useDatabaseUI((s) => s.fieldWidths);
  const setFieldWidth = useDatabaseUI((s) => s.setFieldWidth);
  const frozenColumns = useDatabaseUI((s) => s.frozenColumns);
  const setFrozenColumns = useDatabaseUI((s) => s.setFrozenColumns);

  const parentRef = useRef<HTMLDivElement>(null);
  const [summaryDropdown, setSummaryDropdown] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; record: RecordRow } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropColTargetIdx, setDropColTargetIdx] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<FieldMeta | null>(null);

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      if (prev.size === records.length) return new Set();
      return new Set(records.map((r) => r.id));
    });
  }, [records]);

  const handleBulkDelete = useCallback(() => {
    if (selectedRowIds.size === 0 || !onBulkDeleteRows) return;
    if (!confirm(`Delete ${selectedRowIds.size} selected record(s)?`)) return;
    onBulkDeleteRows(Array.from(selectedRowIds));
    setSelectedRowIds(new Set());
  }, [selectedRowIds, onBulkDeleteRows]);

  const handleRowDragStart = useCallback((e: React.DragEvent, recordId: string) => {
    setDragRowId(recordId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', recordId);
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, idx: number) => {
    if (dragRowId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIdx(idx);
  }, [dragRowId]);

  const handleRowDrop = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (!dragRowId) return;
    const sourceIdx = records.findIndex((r) => r.id === dragRowId);
    if (sourceIdx === -1 || sourceIdx === targetIdx) {
      setDragRowId(null);
      setDropTargetIdx(null);
      return;
    }
    // Swap nc_order values
    const sourceRecord = records[sourceIdx];
    const targetRecord = records[targetIdx];
    const sourceOrder = sourceRecord.nc_order ?? sourceIdx;
    const targetOrder = targetRecord.nc_order ?? targetIdx;
    onCellUpdate(sourceRecord.id, 'nc_order', targetOrder);
    onCellUpdate(targetRecord.id, 'nc_order', sourceOrder);
    setDragRowId(null);
    setDropTargetIdx(null);
  }, [dragRowId, records, onCellUpdate]);

  const handleRowDragEnd = useCallback(() => {
    setDragRowId(null);
    setDropTargetIdx(null);
  }, []);

  // Column drag handlers
  const handleColDragStart = useCallback((e: React.DragEvent, fieldId: string) => {
    setDragColId(fieldId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fieldId);
  }, []);

  const handleColDragOver = useCallback((e: React.DragEvent, idx: number) => {
    if (dragColId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropColTargetIdx(idx);
  }, [dragColId]);

  const handleColDrop = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (!dragColId || !onReorderFields) return;
    const currentIds = visibleFields.map((f) => f.id);
    const sourceIdx = currentIds.indexOf(dragColId);
    if (sourceIdx === -1 || sourceIdx === targetIdx) {
      setDragColId(null);
      setDropColTargetIdx(null);
      return;
    }
    const newIds = [...currentIds];
    const [removed] = newIds.splice(sourceIdx, 1);
    newIds.splice(targetIdx, 0, removed);
    onReorderFields(newIds);
    setDragColId(null);
    setDropColTargetIdx(null);
  }, [dragColId, visibleFields, onReorderFields]);

  const handleColDragEnd = useCallback(() => {
    setDragColId(null);
    setDropColTargetIdx(null);
  }, []);

  const matchesRule = useCallback((record: RecordRow, rule: RowColorRule): boolean => {
    const field = fields.find((f) => f.id === rule.field_id);
    if (!field) return false;
    const val = record[field.pg_column_name];
    const strVal = val == null ? '' : String(val);
    switch (rule.operator) {
      case 'is':
      case 'eq':
        return strVal === String(rule.value ?? '');
      case 'isNot':
      case 'neq':
        return strVal !== String(rule.value ?? '');
      case 'contains':
        return strVal.toLowerCase().includes(String(rule.value ?? '').toLowerCase());
      case 'isEmpty':
        return val == null || strVal === '';
      case 'isNotEmpty':
        return val != null && strVal !== '';
      default:
        return false;
    }
  }, [fields]);

  const getRowColor = useCallback((record: RecordRow): string | undefined => {
    for (const rule of rowColorRules) {
      if (matchesRule(record, rule)) {
        return rule.color + '33'; // ~20% opacity hex suffix
      }
    }
    return undefined;
  }, [rowColorRules, matchesRule]);

  const getCellColor = useCallback(
    (record: RecordRow, fieldId: string): string | undefined => {
      for (const rule of conditionalFormats) {
        if (rule.field_id === fieldId && evaluateCondition(record, rule, fields)) {
          return rule.color;
        }
      }
      return undefined;
    },
    [conditionalFormats, fields],
  );

  const visibleFields = useMemo(() => {
    const visible = fields.filter((f) => !f.is_hidden);
    if (fieldOrder.length > 0) {
      const byId = new Map(visible.map((f) => [f.id, f]));
      const ordered: FieldMeta[] = [];
      for (const id of fieldOrder) {
        const f = byId.get(id);
        if (f) { ordered.push(f); byId.delete(id); }
      }
      // Append any visible fields not in the order
      for (const f of visible.sort((a, b) => a.position - b.position)) {
        if (byId.has(f.id)) ordered.push(f);
      }
      return ordered;
    }
    return visible.sort((a, b) => a.position - b.position);
  }, [fields, fieldOrder]);

  const getFieldWidth = useCallback(
    (field: FieldMeta) => fieldWidths[field.id] ?? field.width ?? 180,
    [fieldWidths],
  );

  const fieldsWithWidths = useMemo(
    () =>
      visibleFields.map((f) => ({
        ...f,
        width: getFieldWidth(f),
      })),
    [visibleFields, getFieldWidth],
  );

  const frozenCount = Math.min(frozenColumns, fieldsWithWidths.length);
  const frozenFields = useMemo(() => fieldsWithWidths.slice(0, frozenCount), [fieldsWithWidths, frozenCount]);
  const scrollableFields = useMemo(() => fieldsWithWidths.slice(frozenCount), [fieldsWithWidths, frozenCount]);
  const frozenWidth = useMemo(() => frozenFields.reduce((sum, f) => sum + f.width, 0), [frozenFields]);

  const totalWidth = useMemo(
    () => ROW_NUMBER_WIDTH + fieldsWithWidths.reduce((sum, f) => sum + f.width, 0),
    [fieldsWithWidths],
  );

  const rowHeightPx = ROW_HEIGHTS[rowHeight] || ROW_HEIGHTS.default;

  // --- Group-by logic ---
  const groupBy = useDatabaseUI((s) => s.groupBy);

  const groupField = useMemo(() => {
    if (!groupBy) return null;
    return fieldsWithWidths.find((f) => f.id === groupBy.field_id) ?? null;
  }, [groupBy, fieldsWithWidths]);

  const GROUP_HEADER_HEIGHT = 32;

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = useCallback((groupValue: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  }, []);

  const groupedRecords = useMemo(() => {
    if (!groupField) return null;
    const col = groupField.pg_column_name;
    const map = new Map<string, RecordRow[]>();
    for (const r of records) {
      const raw = r[col];
      const key = raw == null || raw === '' ? '(Empty)' : String(raw);
      let arr = map.get(key);
      if (!arr) { arr = []; map.set(key, arr); }
      arr.push(r);
    }
    // Sort groups: for SingleSelect, use choices order; otherwise alphabetical
    const uiType = groupField.ui_type || (groupField as any).type || '';
    const choices = groupField.options?.choices;
    let keys: string[];
    if (uiType === 'SingleSelect' && choices && choices.length > 0) {
      const order = new Map(choices.map((c, i) => [c.label, i]));
      keys = [...map.keys()].sort((a, b) => {
        const oa = a === '(Empty)' ? Infinity : (order.get(a) ?? 999999);
        const ob = b === '(Empty)' ? Infinity : (order.get(b) ?? 999999);
        return oa - ob;
      });
    } else {
      keys = [...map.keys()].sort((a, b) => {
        if (a === '(Empty)') return 1;
        if (b === '(Empty)') return -1;
        return a.localeCompare(b);
      });
    }
    if (groupBy?.direction === 'desc') keys.reverse();
    return keys.map((k) => ({ groupValue: k, records: map.get(k)! }));
  }, [groupField, records, groupBy]);

  // Build a flat list of items for grouped view: headers + record rows
  type FlatItem = { type: 'header'; groupValue: string; count: number } | { type: 'row'; record: RecordRow; rowNum: number };
  const flatItems = useMemo<FlatItem[] | null>(() => {
    if (!groupedRecords) return null;
    const items: FlatItem[] = [];
    let runningIdx = 0;
    for (const g of groupedRecords) {
      items.push({ type: 'header', groupValue: g.groupValue, count: g.records.length });
      if (!collapsedGroups.has(g.groupValue)) {
        for (const r of g.records) {
          items.push({ type: 'row', record: r, rowNum: page * pageSize + runningIdx + 1 });
          runningIdx++;
        }
      } else {
        runningIdx += g.records.length;
      }
    }
    return items;
  }, [groupedRecords, collapsedGroups, page, pageSize]);

  const virtualizer = useVirtualizer({
    count: flatItems ? flatItems.length : records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (flatItems && flatItems[index].type === 'header') return GROUP_HEADER_HEIGHT;
      return rowHeightPx;
    },
    overscan: 10,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleResize = useCallback((fieldId: string, width: number) => {
    setFieldWidth(fieldId, width);
  }, [setFieldWidth]);

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
      if (!selectedCellId) return;
      const [rowId, fieldId] = selectedCellId.split(':');
      const rowIdx = records.findIndex((r) => r.id === rowId);
      const colIdx = fieldsWithWidths.findIndex((f) => f.id === fieldId);
      if (rowIdx === -1 || colIdx === -1) return;

      let nextRow = rowIdx;
      let nextCol = colIdx;

      if (e.key === 'ArrowUp') {
        nextRow = Math.max(0, rowIdx - 1);
      } else if (e.key === 'ArrowDown') {
        nextRow = Math.min(records.length - 1, rowIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        nextCol = Math.max(0, colIdx - 1);
      } else if (e.key === 'ArrowRight') {
        nextCol = Math.min(fieldsWithWidths.length - 1, colIdx + 1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          nextCol = colIdx - 1;
          if (nextCol < 0) {
            nextCol = fieldsWithWidths.length - 1;
            nextRow = Math.max(0, rowIdx - 1);
          }
        } else {
          nextCol = colIdx + 1;
          if (nextCol >= fieldsWithWidths.length) {
            nextCol = 0;
            nextRow = Math.min(records.length - 1, rowIdx + 1);
          }
        }
      } else if (e.key === 'Escape') {
        setSelectedCell(null);
        setEditingCell(null);
        return;
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Copy cell value
        const record = records[rowIdx];
        const field = fieldsWithWidths[colIdx];
        const value = record[field.pg_column_name];
        let text = '';
        if (value == null) {
          text = '';
        } else if (Array.isArray(value)) {
          text = value.join(',');
        } else if (typeof value === 'object') {
          text = JSON.stringify(value);
        } else {
          text = String(value);
        }
        navigator.clipboard.writeText(text);
        e.preventDefault();
        return;
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        // Paste into cell
        e.preventDefault();
        navigator.clipboard.readText().then((pastedValue) => {
          const field = fieldsWithWidths[colIdx];
          const fieldType = field.ui_type || field.type || '';
          if (fieldType === 'Checkbox') {
            const boolVal = ['true', '1', 'yes'].includes(pastedValue.toLowerCase());
            onCellUpdate(rowId, fieldId, boolVal);
          } else if (['Number', 'Decimal', 'Currency', 'Percent'].includes(fieldType)) {
            const num = parseFloat(pastedValue);
            onCellUpdate(rowId, fieldId, isNaN(num) ? pastedValue : num);
          } else {
            onCellUpdate(rowId, fieldId, pastedValue);
          }
        });
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setEditingCell(selectedCellId);
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Clear cell
        e.preventDefault();
        onCellUpdate(rowId, fieldId, null);
        return;
      } else {
        return;
      }

      e.preventDefault();
      const nextCellId = `${records[nextRow].id}:${fieldsWithWidths[nextCol].id}`;
      setSelectedCell(nextCellId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellId, records, fieldsWithWidths, setSelectedCell, setEditingCell, onCellUpdate]);

  if (records.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p style={{ color: '#94A3B8', fontSize: 14 }}>
          No records. Click + to add a row.
        </p>
        <button
          onClick={onAddRow}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm hover:bg-gray-100"
          style={{ color: '#3366FF' }}
        >
          <Plus size={14} /> Add row
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex"
            style={{
              height: HEADER_HEIGHT,
              backgroundColor: '#F9F9FA',
              borderBottom: '1px solid #E7E7E9',
            }}
          >
            <div
              className="sticky left-0 z-30 flex items-center justify-center shrink-0"
              style={{
                width: ROW_NUMBER_WIDTH,
                minWidth: ROW_NUMBER_WIDTH,
                backgroundColor: '#F9F9FA',
                borderRight: '1px solid #E7E7E9',
                fontSize: 11,
                color: '#9AA2AF',
              }}
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {!isLoading && records.length > 0 && (
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-[#3366FF]"
                  checked={selectedRowIds.size === records.length && records.length > 0}
                  onChange={toggleSelectAll}
                />
              )}
              {!isLoading && records.length === 0 && '#'}
            </div>

            {fieldsWithWidths.map((field, colIdx) => {
              const isFrozen = colIdx < frozenCount;
              const isLastFrozen = colIdx === frozenCount - 1;
              // Compute left offset for sticky frozen columns
              let stickyLeft = ROW_NUMBER_WIDTH;
              if (isFrozen) {
                for (let i = 0; i < colIdx; i++) stickyLeft += fieldsWithWidths[i].width;
              }
              return (
                <div
                  key={field.id}
                  className="relative"
                  style={{
                    borderLeft: dropColTargetIdx === colIdx && dragColId !== null ? '2px solid #3366FF' : undefined,
                    ...(isFrozen ? {
                      position: 'sticky' as const,
                      left: stickyLeft,
                      zIndex: 25,
                      borderRight: isLastFrozen ? '3px solid #D0D0D4' : undefined,
                    } : {}),
                  }}
                  onDragOver={(e) => handleColDragOver(e, colIdx)}
                  onDrop={(e) => handleColDrop(e, colIdx)}
                >
                  <ColumnHeader
                    field={field}
                    onResize={handleResize}
                    onDelete={onDeleteField}
                    onDuplicateField={onDuplicateField}
                    onEditField={setEditingField}
                    draggable
                    onDragStart={(e) => handleColDragStart(e, field.id)}
                    onDragEnd={handleColDragEnd}
                    columnIndex={colIdx}
                    onFreezeUpTo={setFrozenColumns}
                    isFrozen={isFrozen}
                  />
                </div>
              );
            })}

            <div
              className="flex items-center justify-center shrink-0 cursor-pointer hover:bg-gray-100"
              style={{
                width: 44,
                minWidth: 44,
                backgroundColor: '#F9F9FA',
                borderRight: '1px solid #E7E7E9',
                color: '#9AA2AF',
              }}
              onClick={onAddField}
            >
              <Plus size={14} />
            </div>
          </div>

          {/* Virtualized rows */}
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              // --- Grouped rendering ---
              if (flatItems) {
                const item = flatItems[virtualRow.index];
                if (item.type === 'header') {
                  const isCollapsed = collapsedGroups.has(item.groupValue);
                  return (
                    <div
                      key={`group-${item.groupValue}`}
                      className="absolute left-0 w-full flex items-center cursor-pointer select-none"
                      style={{
                        height: GROUP_HEADER_HEIGHT,
                        top: virtualRow.start,
                        backgroundColor: '#F4F4F5',
                        borderBottom: '1px solid #E7E7E9',
                        paddingLeft: 12,
                      }}
                      onClick={() => toggleGroupCollapse(item.groupValue)}
                    >
                      <ChevronRight
                        size={14}
                        style={{
                          color: '#6A7184',
                          transition: 'transform 150ms',
                          transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: '#374151',
                          fontSize: 12,
                          fontWeight: 600,
                          marginLeft: 6,
                        }}
                      >
                        {item.groupValue}
                      </span>
                      <span
                        style={{
                          color: '#9AA2AF',
                          fontSize: 11,
                          marginLeft: 8,
                        }}
                      >
                        ({item.count} record{item.count !== 1 ? 's' : ''})
                      </span>
                    </div>
                  );
                }
                // item.type === 'row'
                const record = item.record;
                const rowNum = item.rowNum;
                const isRowSelected = selectedCellId?.startsWith(record.id + ':');
                const rowBg = isRowSelected ? '#EBF0FF' : getRowColor(record);
                return (
                  <div
                    key={record.id}
                    className="absolute left-0 w-full flex group/row"
                    style={{
                      height: rowHeightPx,
                      top: virtualRow.start,
                      backgroundColor: rowBg,
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setRowMenu({ x: e.clientX, y: e.clientY, record });
                    }}
                    onMouseEnter={(e) => { if (!isRowSelected) (e.currentTarget as HTMLElement).style.backgroundColor = rowBg || '#F9F9FA'; }}
                    onMouseLeave={(e) => { if (!isRowSelected) (e.currentTarget as HTMLElement).style.backgroundColor = rowBg || ''; }}
                  >
                    <div
                      className="sticky left-0 z-10 flex items-center justify-center shrink-0 group/num"
                      style={{
                        width: ROW_NUMBER_WIDTH,
                        minWidth: ROW_NUMBER_WIDTH,
                        backgroundColor: selectedRowIds.has(record.id) ? '#EBF0FF' : isRowSelected ? '#EBF0FF' : '#F9F9FA',
                        borderRight: '1px solid #E7E7E9',
                        borderBottom: '1px solid #E7E7E9',
                        fontSize: 11,
                        color: '#9AA2AF',
                      }}
                    >
                      {selectedRowIds.has(record.id) ? (
                        <input type="checkbox" className="w-3.5 h-3.5 accent-[#3366FF]" checked onChange={() => toggleRowSelection(record.id)} />
                      ) : (
                        <>
                          <span className="group-hover/row:hidden">{rowNum}</span>
                          <div className="hidden group-hover/row:flex items-center gap-1">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-[#3366FF]" checked={false} onChange={() => toggleRowSelection(record.id)} />
                            {onExpandRow && (
                              <button className="p-0.5 rounded hover:bg-gray-200" onClick={(e) => { e.stopPropagation(); onExpandRow(record); }}>
                                <Expand size={12} />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {fieldsWithWidths.map((field, colIdx) => {
                      const isFroz = colIdx < frozenCount;
                      const isLastFroz = colIdx === frozenCount - 1;
                      let cellLeft = ROW_NUMBER_WIDTH;
                      if (isFroz) {
                        for (let i = 0; i < colIdx; i++) cellLeft += fieldsWithWidths[i].width;
                      }
                      return (
                        <div
                          key={field.id}
                          style={isFroz ? {
                            position: 'sticky',
                            left: cellLeft,
                            zIndex: 5,
                            borderRight: isLastFroz ? '3px solid #D0D0D4' : undefined,
                          } : undefined}
                        >
                          <GridCell field={field} record={record} onCellUpdate={onCellUpdate} backgroundColor={getCellColor(record, field.id)} />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // --- Default (ungrouped) rendering ---
              const record = records[virtualRow.index];
              const rowNum = page * pageSize + virtualRow.index + 1;
              const isRowSelected = selectedCellId?.startsWith(record.id + ':');
              const rowBgUngrouped = isRowSelected ? '#EBF0FF' : getRowColor(record);

              return (
                <div
                  key={record.id}
                  className="absolute left-0 w-full flex group/row"
                  style={{
                    height: rowHeightPx,
                    top: virtualRow.start,
                    backgroundColor: rowBgUngrouped,
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowMenu({ x: e.clientX, y: e.clientY, record });
                  }}
                  onMouseEnter={(e) => {
                    if (!isRowSelected) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = rowBgUngrouped || '#F9F9FA';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isRowSelected) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = rowBgUngrouped || '';
                    }
                  }}
                >
                  {/* Row number with checkbox + expand icon + drag handle */}
                  <div
                    className="sticky left-0 z-10 flex items-center justify-center shrink-0 group/num"
                    style={{
                      width: ROW_NUMBER_WIDTH,
                      minWidth: ROW_NUMBER_WIDTH,
                      backgroundColor: selectedRowIds.has(record.id) ? '#EBF0FF' : isRowSelected ? '#EBF0FF' : '#F9F9FA',
                      borderRight: '1px solid #E7E7E9',
                      borderBottom: '1px solid #E7E7E9',
                      borderTop: dropTargetIdx === virtualRow.index ? '2px solid #3366FF' : undefined,
                      fontSize: 11,
                      color: '#9AA2AF',
                    }}
                    onDragOver={(e) => handleRowDragOver(e, virtualRow.index)}
                    onDrop={(e) => handleRowDrop(e, virtualRow.index)}
                  >
                    {selectedRowIds.has(record.id) ? (
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-[#3366FF]"
                        checked
                        onChange={() => toggleRowSelection(record.id)}
                      />
                    ) : (
                      <>
                        <span className="group-hover/row:hidden">{rowNum}</span>
                        <div className="hidden group-hover/row:flex items-center gap-1">
                          <span
                            draggable
                            className="cursor-grab active:cursor-grabbing px-0.5 text-[#9AA2AF] hover:text-[#374151]"
                            onDragStart={(e) => handleRowDragStart(e, record.id)}
                            onDragEnd={handleRowDragEnd}
                            style={{ fontSize: 13 }}
                          >
                            &#8801;
                          </span>
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-[#3366FF]"
                            checked={false}
                            onChange={() => toggleRowSelection(record.id)}
                          />
                          {onExpandRow && (
                            <button
                              className="p-0.5 rounded hover:bg-gray-200"
                              onClick={(e) => { e.stopPropagation(); onExpandRow(record); }}
                            >
                              <Expand size={12} />
                            </button>
                          )}
                          <button
                            className="p-0.5 rounded hover:bg-gray-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRowMenu({ x: e.clientX, y: e.clientY, record });
                            }}
                          >
                            <MoreHorizontal size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {fieldsWithWidths.map((field, colIdx) => {
                    const isFroz = colIdx < frozenCount;
                    const isLastFroz = colIdx === frozenCount - 1;
                    let cellLeft = ROW_NUMBER_WIDTH;
                    if (isFroz) {
                      for (let i = 0; i < colIdx; i++) cellLeft += fieldsWithWidths[i].width;
                    }
                    return (
                      <div
                        key={field.id}
                        style={isFroz ? {
                          position: 'sticky',
                          left: cellLeft,
                          zIndex: 5,
                          borderRight: isLastFroz ? '3px solid #D0D0D4' : undefined,
                        } : undefined}
                      >
                        <GridCell
                          field={field}
                          record={record}
                          onCellUpdate={onCellUpdate}
                          backgroundColor={getCellColor(record, field.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <SummaryRow
            fields={fieldsWithWidths}
            records={records}
            summaryFunctions={summaryFunctions}
            setSummaryFunction={setSummaryFunction}
            summaryDropdown={summaryDropdown}
            setSummaryDropdown={setSummaryDropdown}
            rowNumberWidth={ROW_NUMBER_WIDTH}
          />

          {/* Add row button */}
          <div
            className="flex items-center cursor-pointer hover:bg-gray-50"
            style={{
              height: rowHeightPx,
              borderBottom: '1px solid #E7E7E9',
            }}
            onClick={onAddRow}
          >
            <div
              className="flex items-center gap-1 px-4"
              style={{ color: '#9AA2AF', fontSize: 13 }}
            >
              <Plus size={14} /> Add row
            </div>
          </div>
        </div>
      </div>

      {/* Row context menu */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setRowMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-[#E7E7E9] rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: rowMenu.x, top: rowMenu.y }}
          >
            {onExpandRow && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                onClick={() => { onExpandRow(rowMenu.record); setRowMenu(null); }}
              >
                <Expand size={14} className="text-[#9AA2AF]" /> Expand row
              </button>
            )}
            {onDuplicateRow && (
              <button
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                onClick={() => { onDuplicateRow(rowMenu.record); setRowMenu(null); }}
              >
                <Copy size={14} className="text-[#9AA2AF]" /> Duplicate row
              </button>
            )}
            {onDeleteRow && (
              <>
                <div className="h-px bg-[#E7E7E9] my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-red-50 flex items-center gap-2 text-red-500"
                  onClick={() => { onDeleteRow(rowMenu.record.id); setRowMenu(null); }}
                >
                  <Trash2 size={14} /> Delete row
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Bulk action bar */}
      {selectedRowIds.size > 0 && (
        <BulkActionsBar
          selectedRowIds={selectedRowIds}
          records={records}
          fields={fields}
          totalCount={totalCount}
          onClearSelection={() => setSelectedRowIds(new Set())}
          onSelectAll={toggleSelectAll}
          onBulkDelete={onBulkDeleteRows ? (ids) => { onBulkDeleteRows(ids); setSelectedRowIds(new Set()); } : undefined}
          onCellUpdate={onCellUpdate}
        />
      )}

      {/* Pagination */}
      <div
        className="flex items-center justify-between px-4 shrink-0 dark:bg-[hsl(200,30%,8%)] dark:border-[hsl(200,25%,18%)]"
        style={{
          height: 40,
          borderTop: '1px solid #E7E7E9',
          backgroundColor: '#F9F9FA',
          fontSize: 13,
          color: '#6A7184',
        }}
      >
        <div className="flex items-center gap-3">
          <span>
            {totalCount} record{totalCount !== 1 ? 's' : ''}
          </span>
          {frozenCount > 0 && (
            <button
              className="flex items-center gap-1 text-[#3366FF] font-medium hover:underline"
              onClick={() => setFrozenColumns(0)}
              title="Click to unfreeze"
            >
              <Lock size={12} /> {frozenCount} frozen
            </button>
          )}
          {selectedRowIds.size > 0 && (
            <span className="text-[#3366FF] font-medium">
              ({selectedRowIds.size} selected)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)] disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)] disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <EditFieldDialog
        open={!!editingField}
        onOpenChange={(open) => { if (!open) setEditingField(null); }}
        field={editingField}
      />
    </div>
  );
}
