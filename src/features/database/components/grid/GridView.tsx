import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Loader2, Expand, Copy, Trash2, MoreHorizontal, Sigma, Lock, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import type { FieldMeta, RecordRow, RowColorRule, UIType, ConditionalFormatRule, Group } from '@/features/database/types';
import { useDatabaseUI, type SummaryFunction } from '../../lib/store';
import { useUndoStore } from '../../lib/undo';
import { coerceValue } from '../../lib/csv';
import { ColumnHeader } from './ColumnHeader';
import { GridCell } from './GridCell';
import { EditFieldDialog } from '../EditFieldDialog';
import { BulkActionsBar } from './BulkActionsBar';
import { GridSkeleton } from './GridSkeleton';
import { useGridColors } from '../../hooks/useGridColors';

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
  onPasteRows?: (rows: Record<string, any>[]) => void;
}


const GROUP_PILL_COLORS = [
  '#3366FF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const ROW_HEIGHTS: Record<string, number> = {
  compact: 32,
  default: 44,
  tall: 64,
  'extra-tall': 88,
};

const ROW_NUMBER_WIDTH = 72;
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
                  <span className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" style={{ fontSize: 10, lineHeight: '14px' }}>{label}</span>
                  <span className="text-[#374151] dark:text-[hsl(200,25%,88%)]" style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500 }}>{value}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: '#9AA2AF' }}>&#8211;</span>
              )}
            </button>

            {isOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSummaryDropdown(null)} />
                <div
                  className="absolute left-0 bottom-full z-50 bg-white dark:bg-[hsl(200,25%,13%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[150px]"
                  style={{ marginBottom: 2 }}
                >
                  {SUMMARY_OPTIONS.filter((opt) => !opt.numericOnly || isNumeric).map((opt) => (
                    <button
                      key={opt.value}
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center justify-between text-[#374151] dark:text-[hsl(200,25%,88%)]"
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
  onExpandRow,
  onDeleteRow,
  onDuplicateRow,
  onDeleteField,
  onDuplicateField,
  onBulkDeleteRows,
  onReorderFields,
  onPasteRows,
  page,
  pageSize,
  onPageChange,
}: GridViewProps) {
  const GRID_COLORS = useGridColors();
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
  const [selectionAnchor, setSelectionAnchor] = useState<{ row: number; col: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const flashCellIds = useCallback((ids: string[]) => {
    setFlashCells(new Set(ids));
    setTimeout(() => setFlashCells(new Set()), 600);
  }, []);

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

  const visibleFields = useMemo(() => {
    const visible = fields.filter((f) => !f.is_hidden);
    if (fieldOrder.length > 0) {
      const byId = new Map(visible.map((f) => [f.id, f]));
      const ordered: FieldMeta[] = [];
      for (const id of fieldOrder) {
        const f = byId.get(id);
        if (f) { ordered.push(f); byId.delete(id); }
      }
      for (const f of visible.sort((a, b) => a.position - b.position)) {
        if (byId.has(f.id)) ordered.push(f);
      }
      return ordered;
    }
    return visible.sort((a, b) => a.position - b.position);
  }, [fields, fieldOrder]);

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
    () => ROW_NUMBER_WIDTH + fieldsWithWidths.reduce((sum, f) => sum + f.width, 0) + 44,
    [fieldsWithWidths],
  );

  const rowHeightPx = ROW_HEIGHTS[rowHeight] || ROW_HEIGHTS.default;

  // --- Multi-level group-by logic ---
  const groupByLevels = useDatabaseUI((s) => s.groupByLevels);

  const groupFields = useMemo(() => {
    return groupByLevels
      .map((g) => fieldsWithWidths.find((f) => f.id === g.field_id) ?? null)
      .filter((f): f is (FieldMeta & { width: number }) => f !== null);
  }, [groupByLevels, fieldsWithWidths]);

  const GROUP_HEADER_HEIGHT = 36;

  // Collapsed groups keyed by their full path (e.g. "Status:Active" or "Status:Active|Priority:High")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  // Recursively group records by multiple levels
  function sortGroupKeys(keys: string[], field: FieldMeta & { width: number }, direction: 'asc' | 'desc'): string[] {
    const uiType = field.ui_type || '';
    const choices = field.options?.choices;
    let sorted: string[];
    if ((uiType === 'SingleSelect' || uiType === 'MultiSelect') && choices && choices.length > 0) {
      const order = new Map(choices.map((c: { label: string }, i: number) => [c.label, i]));
      sorted = [...keys].sort((a, b) => {
        const oa = a === '(Empty)' ? Infinity : (order.get(a) ?? 999999);
        const ob = b === '(Empty)' ? Infinity : (order.get(b) ?? 999999);
        return oa - ob;
      });
    } else {
      sorted = [...keys].sort((a, b) => {
        if (a === '(Empty)') return 1;
        if (b === '(Empty)') return -1;
        return a.localeCompare(b);
      });
    }
    if (direction === 'desc') sorted.reverse();
    return sorted;
  }

  // Build a flat list of items for grouped view: headers at various depths + record rows
  type FlatItem =
    | { type: 'header'; groupKey: string; groupValue: string; count: number; depth: number; fieldName: string; field: FieldMeta & { width: number }; summaryRecords: RecordRow[] }
    | { type: 'row'; record: RecordRow; rowNum: number };

  const flatItems = useMemo<FlatItem[] | null>(() => {
    if (groupFields.length === 0 || groupByLevels.length === 0) return null;
    const items: FlatItem[] = [];
    let runningIdx = 0;

    function buildLevel(recs: RecordRow[], depth: number, parentKey: string) {
      if (depth >= groupFields.length || depth >= groupByLevels.length) {
        // Leaf: emit rows
        for (const r of recs) {
          items.push({ type: 'row', record: r, rowNum: page * pageSize + runningIdx + 1 });
          runningIdx++;
        }
        return;
      }
      const field = groupFields[depth];
      const col = field.pg_column_name;
      const map = new Map<string, RecordRow[]>();
      for (const r of recs) {
        const raw = r[col];
        const key = raw == null || raw === '' ? '(Empty)' : String(raw);
        let arr = map.get(key);
        if (!arr) { arr = []; map.set(key, arr); }
        arr.push(r);
      }
      const sortedKeys = sortGroupKeys([...map.keys()], field, groupByLevels[depth].direction);
      for (const k of sortedKeys) {
        const groupRecs = map.get(k)!;
        const groupKey = parentKey ? `${parentKey}|${field.id}:${k}` : `${field.id}:${k}`;
        items.push({
          type: 'header',
          groupKey,
          groupValue: k,
          count: groupRecs.length,
          depth,
          fieldName: field.name,
          field,
          summaryRecords: groupRecs,
        });
        if (!collapsedGroups.has(groupKey)) {
          buildLevel(groupRecs, depth + 1, groupKey);
        } else {
          runningIdx += groupRecs.length;
        }
      }
    }

    buildLevel(records, 0, '');
    return items;
  }, [groupFields, groupByLevels, records, collapsedGroups, page, pageSize]);

  const collapseAll = useCallback(() => {
    if (!flatItems) return;
    const keys = new Set<string>();
    for (const item of flatItems) {
      if (item.type === 'header') keys.add(item.groupKey);
    }
    setCollapsedGroups(keys);
  }, [flatItems]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

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

  // Helper: serialize a cell value to plain text
  const cellToText = useCallback((value: any): string => {
    if (value == null) return '';
    if (Array.isArray(value)) return value.join(',');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  // Helper: copy selected rows as tab-separated text
  const copySelectedRows = useCallback(() => {
    const selectedRecords = records.filter((r) => selectedRowIds.has(r.id));
    if (selectedRecords.length === 0) return;
    const lines = selectedRecords.map((rec) =>
      fieldsWithWidths.map((f) => cellToText(rec[f.pg_column_name])).join('\t'),
    );
    navigator.clipboard.writeText(lines.join('\n'));
    showToast(`${selectedRecords.length} row${selectedRecords.length !== 1 ? 's' : ''} copied`);
  }, [records, selectedRowIds, fieldsWithWidths, cellToText, showToast]);

  // Helper: copy a range of cells as tab-separated grid
  const copyRange = useCallback((range: { startRow: number; startCol: number; endRow: number; endCol: number }) => {
    const r1 = Math.min(range.startRow, range.endRow);
    const r2 = Math.max(range.startRow, range.endRow);
    const c1 = Math.min(range.startCol, range.endCol);
    const c2 = Math.max(range.startCol, range.endCol);
    const lines: string[] = [];
    for (let r = r1; r <= r2; r++) {
      const rec = records[r];
      if (!rec) continue;
      const cells: string[] = [];
      for (let c = c1; c <= c2; c++) {
        const f = fieldsWithWidths[c];
        if (!f) continue;
        cells.push(cellToText(rec[f.pg_column_name]));
      }
      lines.push(cells.join('\t'));
    }
    const cellCount = (r2 - r1 + 1) * (c2 - c1 + 1);
    navigator.clipboard.writeText(lines.join('\n'));
    showToast(`${cellCount} cell${cellCount !== 1 ? 's' : ''} copied`);
  }, [records, fieldsWithWidths, cellToText, showToast]);

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

      // --- Ctrl+C: copy rows, range, or single cell ---
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        // Priority 1: selected rows
        if (selectedRowIds.size > 0) {
          copySelectedRows();
          return;
        }
        // Priority 2: cell range
        if (selectionRange) {
          copyRange(selectionRange);
          return;
        }
        // Priority 3: single focused cell
        if (selectedCellId) {
          const [, fId] = selectedCellId.split(':');
          const rIdx = records.findIndex((r) => r.id === selectedCellId.split(':')[0]);
          const f = fieldsWithWidths.find((ff) => ff.id === fId);
          if (rIdx !== -1 && f) {
            const text = cellToText(records[rIdx][f.pg_column_name]);
            navigator.clipboard.writeText(text);
            showToast('1 cell copied');
          }
        }
        return;
      }

      // --- Ctrl+X: cut (copy + clear) focused cell ---
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        if (selectedCellId) {
          const [cutRowId, cutFieldId] = selectedCellId.split(':');
          const cutRowIdx = records.findIndex((r) => r.id === cutRowId);
          const cutField = fieldsWithWidths.find((f) => f.id === cutFieldId);
          if (cutRowIdx !== -1 && cutField) {
            const text = cellToText(records[cutRowIdx][cutField.pg_column_name]);
            navigator.clipboard.writeText(text);
            onCellUpdate(cutRowId, cutFieldId, null);
            showToast('Cell cut');
          }
        }
        return;
      }

      // --- Ctrl+V: paste rows or cell(s) ---
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().then((pastedText) => {
          if (!pastedText) return;
          const lines = pastedText.split('\n').filter((l) => l.length > 0);
          const isMultiLine = lines.length > 1 || (lines.length === 1 && lines[0].includes('\t'));
          const hasTabSep = lines.some((l) => l.includes('\t'));

          // Multi-row paste: create new records when rows are selected or no cell focused
          if (isMultiLine && hasTabSep && !selectedCellId && onPasteRows) {
            const newRows: Record<string, any>[] = [];
            for (const line of lines) {
              const cols = line.split('\t');
              const rec: Record<string, any> = {};
              cols.forEach((val, ci) => {
                const field = fieldsWithWidths[ci];
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

          // Multi-cell paste into grid starting at focused cell
          if (isMultiLine && selectedCellId) {
            const [startRowId] = selectedCellId.split(':');
            const startRowIdx = records.findIndex((r) => r.id === startRowId);
            const startColIdx = fieldsWithWidths.findIndex((f) => f.id === selectedCellId.split(':')[1]);
            if (startRowIdx === -1 || startColIdx === -1) return;
            const flashIds: string[] = [];
            let cellCount = 0;
            lines.forEach((line, li) => {
              const rowIdx = startRowIdx + li;
              if (rowIdx >= records.length) return;
              const cols = line.split('\t');
              cols.forEach((val, ci) => {
                const colIdx = startColIdx + ci;
                if (colIdx >= fieldsWithWidths.length) return;
                const field = fieldsWithWidths[colIdx];
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

          // Single cell paste
          if (selectedCellId) {
            const [rowId, fieldId] = selectedCellId.split(':');
            const field = fieldsWithWidths.find((f) => f.id === fieldId);
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
        setSelectionRange(null);
        setSelectionAnchor(null);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setEditingCell(selectedCellId);
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onCellUpdate(rowId, fieldId, null);
        return;
      } else {
        return;
      }

      e.preventDefault();

      // Shift+Arrow extends selection range
      if (e.shiftKey && (e.key.startsWith('Arrow'))) {
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

      const nextCellId = `${records[nextRow].id}:${fieldsWithWidths[nextCol].id}`;
      setSelectedCell(nextCellId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellId, records, fieldsWithWidths, setSelectedCell, setEditingCell, onCellUpdate, selectedRowIds, selectionRange, selectionAnchor, copySelectedRows, copyRange, cellToText, showToast, flashCellIds, onPasteRows]);

  if (isLoading && records.length === 0) {
    return <GridSkeleton rowHeight={rowHeightPx} />;
  }

  if (records.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ backgroundColor: GRID_COLORS.bg }}>
        <p style={{ color: GRID_COLORS.muted, fontSize: 14 }}>
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
          {/* Group collapse/expand bar */}
          {groupByLevels.length > 0 && (
            <div
              className="sticky top-0 z-30 flex items-center gap-2 px-3"
              style={{
                height: 28,
                backgroundColor: '#F4F4F5',
                borderBottom: '1px solid #E7E7E9',
                fontSize: 11,
                color: '#6A7184',
              }}
            >
              <span style={{ fontWeight: 500 }}>
                Grouped by {groupFields.map((f) => f.name).join(' then ')}
              </span>
              <span style={{ color: '#E7E7E9' }}>|</span>
              <button
                className="flex items-center gap-1 hover:text-[#374151]"
                onClick={expandAll}
                style={{ color: '#3366FF', fontSize: 11 }}
              >
                <ChevronsUpDown size={12} /> Expand all
              </button>
              <button
                className="flex items-center gap-1 hover:text-[#374151]"
                onClick={collapseAll}
                style={{ color: '#3366FF', fontSize: 11 }}
              >
                <ChevronsDownUp size={12} /> Collapse all
              </button>
            </div>
          )}
          {/* Header */}
          <div
            className="sticky z-20 flex"
            style={{
              top: groupByLevels.length > 0 ? 28 : 0,
              height: HEADER_HEIGHT,
              backgroundColor: '#F9F9FA',
              borderBottom: '1px solid #E7E7E9',
            }}
          >
            <div
              className="sticky left-0 z-30 flex items-center justify-center shrink-0 group"
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
              className="flex items-center justify-center shrink-0 cursor-pointer hover:bg-black/5"
              style={{
                width: 44,
                minWidth: 44,
                backgroundColor: '#F9F9FA',
                borderRight: '1px solid #E7E7E9',
                color: '#9AA2AF',
              }}
              onClick={onAddField}
              title="Add field"
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
                  const isCollapsed = collapsedGroups.has(item.groupKey);
                  const indent = item.depth * 24;
                  const isSelectType = item.field.ui_type === 'SingleSelect' || item.field.ui_type === 'MultiSelect';
                  const isEmpty = item.groupValue === '(Empty)';
                  const choices = item.field.options?.choices;
                  const choiceColor = isSelectType && choices
                    ? choices.find((c: { label: string; color?: string }) => c.label === item.groupValue)?.color
                    : undefined;
                  const pillBg = choiceColor || (isSelectType ? GROUP_PILL_COLORS[Math.abs(item.groupValue.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % GROUP_PILL_COLORS.length] + '20' : undefined);
                  const pillText = choiceColor ? '#FFFFFF' : (isSelectType ? GROUP_PILL_COLORS[Math.abs(item.groupValue.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % GROUP_PILL_COLORS.length] : undefined);

                  // Compute summary for numeric fields if configured
                  const summaryParts: string[] = [];
                  for (const f of fieldsWithWidths) {
                    const fn = summaryFunctions[f.id];
                    if (fn && fn !== 'none') {
                      const val = computeSummary(fn, item.summaryRecords, f.pg_column_name);
                      if (val) summaryParts.push(`${SUMMARY_LABELS[fn]}: ${val}`);
                    }
                  }

                  return (
                    <div
                      key={`group-${item.groupKey}`}
                      className="absolute left-0 w-full flex items-center cursor-pointer select-none"
                      style={{
                        height: GROUP_HEADER_HEIGHT,
                        top: virtualRow.start,
                        backgroundColor: item.depth === 0 ? '#F4F4F5' : '#F9F9FA',
                        borderBottom: '1px solid #E7E7E9',
                        borderLeft: item.depth > 0 ? `3px solid ${GRID_COLORS.primary}40` : undefined,
                        paddingLeft: 12 + indent,
                      }}
                      onClick={() => toggleGroupCollapse(item.groupKey)}
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
                          color: '#6A7184',
                          fontSize: 11,
                          marginLeft: 6,
                          marginRight: 4,
                          flexShrink: 0,
                        }}
                      >
                        {item.fieldName}
                      </span>
                      {isEmpty ? (
                        <span style={{ color: '#9AA2AF', fontSize: 12, fontStyle: 'italic', marginLeft: 2 }}>(Empty)</span>
                      ) : isSelectType && !isEmpty ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '1px 8px',
                            borderRadius: 10,
                            backgroundColor: pillBg,
                            color: pillText || '#374151',
                            marginLeft: 2,
                          }}
                        >
                          {item.groupValue}
                        </span>
                      ) : (
                        <span className="text-[#374151] dark:text-[hsl(200,25%,88%)]" style={{ fontSize: 12, fontWeight: 600, marginLeft: 2 }}>
                          {item.groupValue}
                        </span>
                      )}
                      <span style={{ color: '#9AA2AF', fontSize: 11, marginLeft: 8, flexShrink: 0 }}>
                        ({item.count})
                      </span>
                      {summaryParts.length > 0 && (
                        <span style={{ color: '#6A7184', fontSize: 10, marginLeft: 12, flexShrink: 0 }}>
                          {summaryParts.join(' | ')}
                        </span>
                      )}
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
                      transition: 'background-color 150ms ease',
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
                          <div
                            style={flashCells.has(`${record.id}:${field.id}`) ? {
                              boxShadow: 'inset 0 0 0 2px #3366FF',
                              transition: 'box-shadow 0.3s ease-out',
                            } : undefined}
                          >
                            <GridCell field={field} record={record} onCellUpdate={onCellUpdate} backgroundColor={getCellColor(record, field.id)} />
                          </div>
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
                    transition: 'background-color 150ms ease',
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
                        <div
                          onClick={(e) => {
                            if (e.shiftKey && selectedCellId) {
                              const [, anchorFid] = selectedCellId.split(':');
                              const anchorRowIdx = records.findIndex((r) => r.id === selectedCellId.split(':')[0]);
                              const anchorColIdx = fieldsWithWidths.findIndex((f) => f.id === anchorFid);
                              if (anchorRowIdx !== -1 && anchorColIdx !== -1) {
                                setSelectionAnchor({ row: anchorRowIdx, col: anchorColIdx });
                                setSelectionRange({
                                  startRow: anchorRowIdx,
                                  startCol: anchorColIdx,
                                  endRow: virtualRow.index,
                                  endCol: colIdx,
                                });
                              }
                            } else {
                              setSelectionRange(null);
                              setSelectionAnchor(null);
                            }
                          }}
                          style={{
                            ...(flashCells.has(`${record.id}:${field.id}`) ? {
                              boxShadow: 'inset 0 0 0 2px #3366FF',
                              transition: 'box-shadow 0.3s ease-out',
                            } : {}),
                            ...(selectionRange && (() => {
                              const r1 = Math.min(selectionRange.startRow, selectionRange.endRow);
                              const r2 = Math.max(selectionRange.startRow, selectionRange.endRow);
                              const c1 = Math.min(selectionRange.startCol, selectionRange.endCol);
                              const c2 = Math.max(selectionRange.startCol, selectionRange.endCol);
                              return virtualRow.index >= r1 && virtualRow.index <= r2 && colIdx >= c1 && colIdx <= c2
                                ? { backgroundColor: '#3366FF14' } : {};
                            })()),
                          }}
                        >
                          <GridCell
                            field={field}
                            record={record}
                            onCellUpdate={onCellUpdate}
                            backgroundColor={getCellColor(record, field.id)}
                          />
                        </div>
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
            frozenCount={frozenCount}
          />

          {/* Add row button */}
          <button
            className="flex items-center w-full text-left cursor-pointer transition-colors"
            style={{
              height: rowHeightPx,
              borderBottom: '1px solid #E7E7E9',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = GRID_COLORS.hoverRow)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = GRID_COLORS.bg)}
            onClick={onAddRow}
          >
            <div
              className="flex items-center gap-1 px-4"
              style={{ color: '#9AA2AF', fontSize: 13 }}
            >
              <Plus size={14} /> Add row
            </div>
          </button>
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
            Page {page} of {totalPages}
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

      {/* Clipboard toast notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#374151',
            color: '#FFFFFF',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'fadeInUp 0.2s ease-out',
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
