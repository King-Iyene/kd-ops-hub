import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Loader2, Expand, Copy, Trash2, MoreHorizontal, Sigma, Lock, ChevronsUpDown, ChevronsDownUp, Rows3, ClipboardCopy, PlusCircle } from 'lucide-react';
import type { FieldMeta, RecordRow, RowColorRule, UIType, ConditionalFormatRule, Group } from '@/features/database/types';
import { useDatabaseUI, type SummaryFunction } from '../../lib/store';
import { useUndoStore } from '../../lib/undo';
import { coerceValue } from '../../lib/csv';
import { ColumnHeader } from './ColumnHeader';
import { GridCell } from './GridCell';
import { EditFieldDialog } from '../EditFieldDialog';
import { BulkActionsBar } from './BulkActionsBar';
import { GridSkeleton } from './GridSkeleton';
import { RowContextMenu } from './RowContextMenu';
import { useGridColors, type GridColorTokens } from '../../hooks/useGridColors';
import { confirm as styledConfirm } from '@/hooks/use-confirm';

export interface GridViewProps {
  fields: FieldMeta[];
  records: RecordRow[];
  totalCount: number;
  isLoading: boolean;
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onAddRow: (record?: Record<string, any>) => void;
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
  '#166EE1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const ROW_HEIGHTS: Record<string, number> = {
  short: 32,
  medium: 44,
  tall: 64,
  'extra-tall': 100,
};

const ROW_NUMBER_WIDTH = 44;
const HEADER_HEIGHT = 32;

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
  if (fn === 'min') return nums.reduce((a, b) => (b < a ? b : a), nums[0]).toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (fn === 'max') return nums.reduce((a, b) => (b > a ? b : a), nums[0]).toLocaleString(undefined, { maximumFractionDigits: 4 });
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

function getDefaultSummary(uiType: UIType): SummaryFunction {
  if (NUMERIC_TYPES.includes(uiType)) return 'sum';
  if (uiType === 'Checkbox') return 'percentFilled';
  if (uiType === 'SingleSelect' || uiType === 'MultiSelect') return 'countFilled';
  return 'none';
}

const SummaryRow = React.memo(function SummaryRow({
  fields,
  records,
  summaryFunctions,
  setSummaryFunction,
  summaryDropdown,
  setSummaryDropdown,
  rowNumberWidth,
  frozenCount = 0,
  colors,
}: {
  fields: (FieldMeta & { width: number })[];
  records: RecordRow[];
  summaryFunctions: Record<string, SummaryFunction>;
  setSummaryFunction: (fieldId: string, fn: SummaryFunction) => void;
  summaryDropdown: string | null;
  setSummaryDropdown: (id: string | null) => void;
  rowNumberWidth: number;
  frozenCount?: number;
  colors: GridColorTokens;
}) {
  const summaryValues = useMemo(() => {
    const map: Record<string, string> = {};
    for (const field of fields) {
      const explicit = summaryFunctions[field.id];
      const fn = explicit ?? getDefaultSummary(field.ui_type);
      map[field.id] = computeSummary(fn, records, field.pg_column_name);
    }
    return map;
  }, [fields, records, summaryFunctions]);

  return (
    <div
      className="flex"
      style={{
        backgroundColor: colors.headerBg,
        borderTop: `1px solid ${colors.borderStrong}`,
        borderBottom: `1px solid ${colors.border}`,
        minHeight: 36,
      }}
    >
      {/* Sigma icon cell */}
      <div
        className="sticky left-0 z-10 flex items-center justify-center shrink-0"
        style={{
          width: rowNumberWidth,
          minWidth: rowNumberWidth,
          backgroundColor: colors.headerBg,
          borderRight: `1px solid ${colors.border}`,
          color: colors.muted,
        }}
      >
        <Sigma size={14} />
      </div>

      {fields.map((field, colIdx) => {
        const explicit = summaryFunctions[field.id];
        const fn = explicit ?? getDefaultSummary(field.ui_type);
        const isNumeric = NUMERIC_TYPES.includes(field.ui_type);
        const value = summaryValues[field.id] ?? '';
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
              borderRight: isLastFroz ? `1px solid ${colors.border}` : `1px solid ${colors.border}`,
              backgroundColor: colors.headerBg,
              ...(isFroz ? { position: 'sticky' as const, left: cellLeft, zIndex: 10, boxShadow: isLastFroz ? '4px 0 8px rgba(0,0,0,0.08)' : undefined } : {}),
            }}
          >
            <button
              data-summary-field={field.id}
              className="w-full h-full flex flex-col justify-center px-2 text-left"
              style={{ minHeight: 40 }}
              onClick={() => setSummaryDropdown(isOpen ? null : field.id)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {fn !== 'none' ? (
                <>
                  <span style={{ fontSize: 10, lineHeight: '14px', color: colors.muted }}>{label}</span>
                  <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: colors.text }}>{value}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: colors.muted }}>&#8211;</span>
              )}
            </button>

            {isOpen && (() => {
              const btnEl = document.querySelector(`[data-summary-field="${field.id}"]`);
              const rect = btnEl?.getBoundingClientRect();
              return (
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setSummaryDropdown(null)} />
                <div
                  className="fixed z-[9999] rounded-lg shadow-lg py-1 min-w-[150px]"
                  style={{
                    left: rect ? rect.left : 0,
                    top: rect ? rect.top - 4 : 0,
                    transform: 'translateY(-100%)',
                    backgroundColor: colors.cellEditorBg,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  {SUMMARY_OPTIONS.filter((opt) => !opt.numericOnly || isNumeric).map((opt) => (
                    <button
                      key={opt.value}
                      className="w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between"
                      style={{ color: colors.text }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.hoverRow)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      onClick={() => {
                        setSummaryFunction(field.id, opt.value);
                        setSummaryDropdown(null);
                      }}
                    >
                      <span>{opt.label}</span>
                      {fn === opt.value && <span style={{ color: colors.primary }}>&#10003;</span>}
                    </button>
                  ))}
                </div>
              </>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
});

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
  const editingCellId = useDatabaseUI((s) => s.editingCellId);
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
  const [editingField, setEditingFieldRaw] = useState<FieldMeta | null>(null);
  const setEditingField = useCallback((f: FieldMeta | null) => {
    if (f) setEditingCell(null);
    setEditingFieldRaw(f);
  }, [setEditingCell]);
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

  const handleBulkDelete = useCallback(async () => {
    if (selectedRowIds.size === 0 || !onBulkDeleteRows) return;
    const ok = await styledConfirm({ description: `Delete ${selectedRowIds.size} selected record(s)?`, variant: 'destructive' });
    if (!ok) return;
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

    // Build the reordered array: remove the dragged record from sourceIdx
    // and reinsert it at targetIdx, shifting every record in between.
    const reordered = records.slice();
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Only the records between the source and target positions actually
    // change position, so only recompute (and persist) nc_order for that
    // affected range rather than the whole table.
    const rangeStart = Math.min(sourceIdx, targetIdx);
    const rangeEnd = Math.max(sourceIdx, targetIdx);

    // Anchor the new order values to the nc_order of the rows just outside
    // the affected range (falling back to the row's index when nc_order is
    // missing), then space the affected rows evenly between them. This
    // avoids colliding with orders of untouched rows on either side.
    const before = rangeStart > 0 ? records[rangeStart - 1] : undefined;
    const after = rangeEnd < records.length - 1 ? records[rangeEnd + 1] : undefined;
    const lowOrder = before?.nc_order ?? rangeStart - 1;
    const highOrder = after?.nc_order ?? rangeEnd + 1;
    const span = rangeEnd - rangeStart + 1;
    const step = (highOrder - lowOrder) / (span + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
      const record = reordered[i];
      const newOrder = lowOrder + step * (i - rangeStart + 1);
      if (record.nc_order !== newOrder) {
        onCellUpdate(record.id, 'nc_order', newOrder);
      }
    }

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
    (field: FieldMeta) => fieldWidths[field.id] ?? field.width ?? (field.is_primary ? 200 : 180),
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

  const rowHeightPx = ROW_HEIGHTS[rowHeight] || ROW_HEIGHTS.medium;

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
      const order = new Map(choices.map((c: { title: string }, i: number) => [c.title, i]));
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
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
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
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
    showToast(`${cellCount} cell${cellCount !== 1 ? 's' : ''} copied`);
  }, [records, fieldsWithWidths, cellToText, showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when focus is in an input, textarea, or dialog
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]')
      ) {
        return;
      }
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
            navigator.clipboard.writeText(text).catch(() => {});
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
            navigator.clipboard.writeText(text).catch(() => {});
            onCellUpdate(cutRowId, cutFieldId, null);
            showToast('Cell cut');
          }
        }
        return;
      }

      // --- Ctrl+V: paste rows or cell(s) ---
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().catch(() => '').then((pastedText) => {
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
      // Don't navigate when a cell is being edited — let the editor handle arrow keys
      if (editingCellId && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown')) return;
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
      } else if (e.key === 'Home') {
        if (e.ctrlKey || e.metaKey) { nextRow = 0; nextCol = 0; }
        else { nextCol = 0; }
      } else if (e.key === 'End') {
        if (e.ctrlKey || e.metaKey) { nextRow = records.length - 1; nextCol = fieldsWithWidths.length - 1; }
        else { nextCol = fieldsWithWidths.length - 1; }
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
      } else if (e.key === ' ' && !editingCellId) {
        e.preventDefault();
        onExpandRow?.(records[rowIdx]);
        return;
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        onAddRow();
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setEditingCell(selectedCellId);
        return;
      } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (rowIdx > 0) {
          const aboveRecord = records[rowIdx - 1];
          const field = fieldsWithWidths[colIdx];
          const valueAbove = aboveRecord[field.pg_column_name];
          if (valueAbove !== undefined) {
            onCellUpdate(rowId, fieldId, valueAbove);
          }
        }
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onCellUpdate(rowId, fieldId, null);
        return;
      } else if (
        !editingCellId &&
        e.key.length === 1 &&
        !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        setEditingCell(selectedCellId);
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

      // Scroll the newly focused row into view
      if (nextRow !== rowIdx) {
        virtualizer.scrollToIndex(nextRow, { align: 'auto' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellId, editingCellId, records, fieldsWithWidths, setSelectedCell, setEditingCell, onCellUpdate, selectedRowIds, selectionRange, selectionAnchor, copySelectedRows, copyRange, cellToText, showToast, flashCellIds, onPasteRows, onExpandRow, onAddRow, virtualizer]);

  useEffect(() => {
    const handler = (e: Event) => {
      const record = (e as CustomEvent).detail;
      if (record && onExpandRow) onExpandRow(record);
    };
    window.addEventListener('grid:expand-row', handler);
    return () => window.removeEventListener('grid:expand-row', handler);
  }, [onExpandRow]);

  // Dismiss cell editors when a modal dialog opens (but not cell-editor popovers)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('[role="dialog"], [data-state="open"][role="alertdialog"]');
      if (dialog && !dialog.closest('[data-radix-popper-content-wrapper]')) {
        setEditingCell(null);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [setEditingCell]);

  if (isLoading && records.length === 0) {
    return <GridSkeleton rowHeight={rowHeightPx} />;
  }

  if (records.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" style={{ backgroundColor: GRID_COLORS.bg }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: GRID_COLORS.groupHeaderBg }}>
          <Rows3 size={28} style={{ color: GRID_COLORS.muted }} />
        </div>
        <div className="text-center">
          <p style={{ color: GRID_COLORS.text, fontSize: 14, fontWeight: 600 }}>
            No records yet
          </p>
          <p style={{ color: GRID_COLORS.muted, fontSize: 13 }} className="mt-1">
            Add your first row to get started
          </p>
        </div>
        <button
          onClick={() => onAddRow()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: GRID_COLORS.primary }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={14} /> Add row
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }} role="grid" aria-colcount={fieldsWithWidths.length} aria-rowcount={records.length}>
          {/* Group collapse/expand bar */}
          {groupByLevels.length > 0 && (
            <div
              className="sticky top-0 z-30 flex items-center gap-2 px-3"
              style={{
                height: 28,
                backgroundColor: GRID_COLORS.headerBg,
                borderBottom: `1px solid ${GRID_COLORS.border}`,
                fontSize: 11,
                color: GRID_COLORS.muted,
              }}
            >
              <span style={{ fontWeight: 500 }}>
                Grouped by {groupFields.map((f) => f.name).join(' then ')}
              </span>
              <span style={{ color: GRID_COLORS.border }}>|</span>
              <button
                className="flex items-center gap-1 hover:opacity-80"
                onClick={expandAll}
                style={{ color: GRID_COLORS.primary, fontSize: 11 }}
              >
                <ChevronsUpDown size={12} /> Expand all
              </button>
              <button
                className="flex items-center gap-1 hover:opacity-80"
                onClick={collapseAll}
                style={{ color: GRID_COLORS.primary, fontSize: 11 }}
              >
                <ChevronsDownUp size={12} /> Collapse all
              </button>
            </div>
          )}
          {/* Header */}
          <div
            className="sticky z-20 flex"
            role="row"
            style={{
              top: groupByLevels.length > 0 ? 28 : 0,
              height: HEADER_HEIGHT,
              backgroundColor: GRID_COLORS.headerBg,
              borderBottom: `1px solid ${GRID_COLORS.borderStrong}`,
            }}
          >
            <div
              className="sticky left-0 z-30 flex items-center justify-center shrink-0 group"
              style={{
                width: ROW_NUMBER_WIDTH,
                minWidth: ROW_NUMBER_WIDTH,
                backgroundColor: GRID_COLORS.headerBg,
                borderRight: `1px solid ${GRID_COLORS.border}`,
                fontSize: 11,
                color: GRID_COLORS.muted,
              }}
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {!isLoading && records.length > 0 && (
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded"
                  style={{ accentColor: GRID_COLORS.primary }}
                  checked={selectedRowIds.size === records.length && records.length > 0}
                  onChange={toggleSelectAll}
                  aria-label="Select all rows"
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
                  className="relative shrink-0"
                  role="columnheader"
                  aria-colindex={colIdx + 1}
                  style={{
                    width: field.width || 180,
                    minWidth: field.width || 180,
                    borderLeft: dropColTargetIdx === colIdx && dragColId !== null ? `2px solid ${GRID_COLORS.primary}` : undefined,
                    ...(isFrozen ? {
                      position: 'sticky' as const,
                      left: stickyLeft,
                      zIndex: 25,
                      backgroundColor: GRID_COLORS.headerBg,
                      borderRight: isLastFrozen ? `1px solid ${GRID_COLORS.border}` : undefined,
                      boxShadow: isLastFrozen ? '4px 0 8px rgba(0,0,0,0.08)' : undefined,
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
              className="flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              style={{
                width: 44,
                minWidth: 44,
                backgroundColor: GRID_COLORS.headerBg,
                borderRight: `1px solid ${GRID_COLORS.border}`,
                color: GRID_COLORS.muted,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = GRID_COLORS.hoverRow; e.currentTarget.style.color = GRID_COLORS.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = GRID_COLORS.headerBg; e.currentTarget.style.color = GRID_COLORS.muted; }}
              onClick={onAddField}
              title="Add field"
              aria-label="Add field"
            >
              <Plus size={15} />
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
                    ? choices.find((c: { title: string; color?: string }) => c.title === item.groupValue)?.color
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
                        backgroundColor: item.depth === 0 ? GRID_COLORS.groupHeaderBg : GRID_COLORS.headerBg,
                        borderBottom: `1px solid ${GRID_COLORS.border}`,
                        borderLeft: item.depth > 0 ? `3px solid ${GRID_COLORS.primary}40` : undefined,
                        paddingLeft: 12 + indent,
                      }}
                      onClick={() => toggleGroupCollapse(item.groupKey)}
                    >
                      <ChevronRight
                        size={14}
                        style={{
                          color: GRID_COLORS.muted,
                          transition: 'transform 150ms',
                          transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: GRID_COLORS.muted,
                          fontSize: 11,
                          marginLeft: 6,
                          marginRight: 4,
                          flexShrink: 0,
                        }}
                      >
                        {item.fieldName}
                      </span>
                      {isEmpty ? (
                        <span style={{ color: GRID_COLORS.muted, fontSize: 12, fontStyle: 'italic', marginLeft: 2 }}>(Empty)</span>
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
                            color: pillText || GRID_COLORS.text,
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
                      <span style={{ color: GRID_COLORS.muted, fontSize: 11, marginLeft: 8, flexShrink: 0 }}>
                        ({item.count})
                      </span>
                      {summaryParts.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 12, flexShrink: 0 }}>
                          <span style={{ color: GRID_COLORS.muted, fontSize: 11 }}>&mdash;</span>
                          {summaryParts.map((part, idx) => (
                            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  backgroundColor: GRID_COLORS.primary + '12',
                                  color: GRID_COLORS.muted,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {part}
                              </span>
                              {idx < summaryParts.length - 1 && (
                                <span style={{ color: GRID_COLORS.muted, fontSize: 10 }}>&middot;</span>
                              )}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                }
                // item.type === 'row'
                const record = item.record;
                const rowNum = item.rowNum;
                const isRowSelected = selectedCellId?.startsWith(record.id + ':');
                const rowColor = getRowColor(record);
                const altBgGrouped = virtualRow.index % 2 === 1 ? GRID_COLORS.altRowBg : GRID_COLORS.bg;
                const rowBg = isRowSelected ? GRID_COLORS.selectedRowBg : undefined;
                return (
                  <div
                    key={record.id}
                    className="absolute left-0 w-full flex group/row"
                    role="row"
                    aria-selected={selectedRowIds.has(record.id)}
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
                    onMouseEnter={(e) => { if (!isRowSelected) (e.currentTarget as HTMLElement).style.backgroundColor = GRID_COLORS.hoverRow; }}
                    onMouseLeave={(e) => { if (!isRowSelected) (e.currentTarget as HTMLElement).style.backgroundColor = rowColor ?? altBgGrouped; }}
                  >
                    {rowColor && (
                      <div
                        className="absolute left-0 top-0 h-full z-20 pointer-events-none"
                        style={{ width: 3, backgroundColor: rowColor }}
                      />
                    )}
                    <div
                      className="sticky left-0 z-10 flex items-center justify-center shrink-0 group/num"
                      style={{
                        width: ROW_NUMBER_WIDTH,
                        minWidth: ROW_NUMBER_WIDTH,
                        backgroundColor: selectedRowIds.has(record.id) ? GRID_COLORS.selectedRowBg : isRowSelected ? GRID_COLORS.selectedRowBg : GRID_COLORS.headerBg,
                        borderRight: `1px solid ${GRID_COLORS.border}`,
                        borderBottom: `1px solid ${GRID_COLORS.border}`,
                        borderTop: dropTargetIdx === virtualRow.index ? `2px solid ${GRID_COLORS.primary}` : undefined,
                        fontSize: 11,
                        color: GRID_COLORS.muted,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleRowSelection(record.id)}
                      onDragOver={(e) => handleRowDragOver(e, virtualRow.index)}
                      onDrop={(e) => handleRowDrop(e, virtualRow.index)}
                    >
                      {selectedRowIds.has(record.id) ? (
                        <input type="checkbox" className="w-3.5 h-3.5 rounded" style={{ accentColor: GRID_COLORS.primary }} checked onChange={() => toggleRowSelection(record.id)} aria-label={`Deselect row ${rowNum}`} />
                      ) : (
                        <>
                          <span className="group-hover/row:hidden">{rowNum}</span>
                          <div className="hidden group-hover/row:flex items-center gap-1">
                            <span
                              draggable
                              className="cursor-grab active:cursor-grabbing px-0.5 text-[#9AA2AF] hover:text-[#374151] dark:text-[hsl(200,20%,55%)] dark:hover:text-[hsl(200,25%,88%)]"
                              onDragStart={(e) => handleRowDragStart(e, record.id)}
                              onDragEnd={handleRowDragEnd}
                              style={{ fontSize: 13 }}
                              role="button"
                              aria-label={`Drag to reorder row ${rowNum}`}
                            >
                              &#8801;
                            </span>
                            <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={false} onChange={() => toggleRowSelection(record.id)} aria-label={`Select row ${rowNum}`} />
                            {onExpandRow && (
                              <button className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)]" onClick={(e) => { e.stopPropagation(); onExpandRow(record); }} aria-label={`Expand row ${rowNum}`}>
                                <Expand size={12} />
                              </button>
                            )}
                            <button
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRowMenu({ x: e.clientX, y: e.clientY, record });
                              }}
                              aria-label={`Row ${rowNum} options`}
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
                          className="shrink-0"
                          role="gridcell"
                          aria-colindex={colIdx + 1}
                          style={{
                            height: '100%',
                            width: field.width || 180,
                            minWidth: field.width || 180,
                            ...(isFroz ? {
                              position: 'sticky' as const,
                              left: cellLeft,
                              zIndex: 5,
                              borderRight: isLastFroz ? `1px solid ${GRID_COLORS.border}` : undefined,
                              boxShadow: isLastFroz ? '4px 0 8px rgba(0,0,0,0.08)' : undefined,
                            } : {}),
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              ...(flashCells.has(`${record.id}:${field.id}`) ? {
                                boxShadow: `inset 0 0 0 2px ${GRID_COLORS.primary}`,
                                transition: 'box-shadow 0.3s ease-out',
                              } : {}),
                            }}
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
              const rowColorUngrouped = getRowColor(record);
              const altBg = virtualRow.index % 2 === 1 ? GRID_COLORS.altRowBg : GRID_COLORS.bg;
              const rowBgUngrouped = isRowSelected ? GRID_COLORS.selectedRowBg : (rowColorUngrouped || altBg);

              return (
                <div
                  key={record.id}
                  className="absolute left-0 w-full flex group/row"
                  role="row"
                  aria-selected={selectedRowIds.has(record.id)}
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
                      (e.currentTarget as HTMLElement).style.backgroundColor = GRID_COLORS.hoverRow;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isRowSelected) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = rowColorUngrouped ?? altBg;
                    }
                  }}
                >
                  {rowColorUngrouped && (
                    <div
                      className="absolute left-0 top-0 h-full z-20 pointer-events-none"
                      style={{ width: 3, backgroundColor: rowColorUngrouped }}
                    />
                  )}
                  {/* Row number gutter */}
                  <div
                    className="sticky left-0 z-10 flex items-center justify-center shrink-0 group/num"
                    style={{
                      width: ROW_NUMBER_WIDTH,
                      minWidth: ROW_NUMBER_WIDTH,
                      backgroundColor: selectedRowIds.has(record.id) ? GRID_COLORS.selectedRowBg : isRowSelected ? GRID_COLORS.selectedRowBg : (virtualRow.index % 2 === 1 ? GRID_COLORS.altRowBg : GRID_COLORS.headerBg),
                      borderRight: `1px solid ${GRID_COLORS.border}`,
                      borderBottom: `1px solid ${GRID_COLORS.border}`,
                      borderTop: dropTargetIdx === virtualRow.index ? `2px solid ${GRID_COLORS.primary}` : undefined,
                      fontSize: 11,
                      color: GRID_COLORS.muted,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleRowSelection(record.id)}
                    onDragOver={(e) => handleRowDragOver(e, virtualRow.index)}
                    onDrop={(e) => handleRowDrop(e, virtualRow.index)}
                  >
                    {selectedRowIds.has(record.id) ? (
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded"
                        style={{ accentColor: GRID_COLORS.primary }}
                        checked
                        onChange={() => toggleRowSelection(record.id)}
                        aria-label={`Deselect row ${rowNum}`}
                      />
                    ) : (
                      <>
                        <span className="group-hover/row:hidden">{rowNum}</span>
                        <div className="hidden group-hover/row:flex items-center gap-1">
                          <span
                            draggable
                            className="cursor-grab active:cursor-grabbing px-0.5 text-[#9AA2AF] hover:text-[#374151] dark:text-[hsl(200,20%,55%)] dark:hover:text-[hsl(200,25%,88%)]"
                            onDragStart={(e) => handleRowDragStart(e, record.id)}
                            onDragEnd={handleRowDragEnd}
                            style={{ fontSize: 13 }}
                            role="button"
                            aria-label={`Drag to reorder row ${rowNum}`}
                          >
                            &#8801;
                          </span>
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded"
                            checked={false}
                            onChange={() => toggleRowSelection(record.id)}
                            aria-label={`Select row ${rowNum}`}
                          />
                          {onExpandRow && (
                            <button
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)]"
                              onClick={(e) => { e.stopPropagation(); onExpandRow(record); }}
                              aria-label={`Expand row ${rowNum}`}
                            >
                              <Expand size={12} />
                            </button>
                          )}
                          <button
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRowMenu({ x: e.clientX, y: e.clientY, record });
                            }}
                            aria-label={`Row ${rowNum} options`}
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
                    const isFlash = flashCells.has(`${record.id}:${field.id}`);
                    const isInRange = selectionRange && (() => {
                      const r1 = Math.min(selectionRange.startRow, selectionRange.endRow);
                      const r2 = Math.max(selectionRange.startRow, selectionRange.endRow);
                      const c1 = Math.min(selectionRange.startCol, selectionRange.endCol);
                      const c2 = Math.max(selectionRange.startCol, selectionRange.endCol);
                      return virtualRow.index >= r1 && virtualRow.index <= r2 && colIdx >= c1 && colIdx <= c2;
                    })();
                    return (
                      <div
                        key={field.id}
                        className="shrink-0"
                        role="gridcell"
                        aria-colindex={colIdx + 1}
                        style={{
                          height: '100%',
                          width: field.width || 180,
                          minWidth: field.width || 180,
                          ...(isFroz ? {
                            position: 'sticky' as const,
                            left: cellLeft,
                            zIndex: 5,
                            borderRight: isLastFroz ? `1px solid ${GRID_COLORS.border}` : undefined,
                            boxShadow: isLastFroz ? '4px 0 8px rgba(0,0,0,0.08)' : undefined,
                          } : {}),
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            ...(isFlash ? {
                              boxShadow: `inset 0 0 0 2px ${GRID_COLORS.primary}`,
                              transition: 'box-shadow 0.3s ease-out',
                            } : {}),
                            ...(isInRange ? { backgroundColor: `${GRID_COLORS.primary}14` } : {}),
                          }}
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
                        >
                          <GridCell
                            field={field}
                            record={record}
                            onCellUpdate={onCellUpdate}
                            backgroundColor={getCellColor(record, field.id)}
                            frozen={isFroz}
                            frozenLeft={cellLeft}
                            rowBg={rowBgUngrouped}
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
            colors={GRID_COLORS}
          />

          {/* Add row button */}
          <button
            className="flex items-center w-full text-left cursor-pointer transition-colors"
            style={{
              height: rowHeightPx,
              borderBottom: `1px solid ${GRID_COLORS.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = GRID_COLORS.hoverRow; const span = e.currentTarget.querySelector('span'); if (span) span.style.color = GRID_COLORS.primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; const span = e.currentTarget.querySelector('span'); if (span) span.style.color = GRID_COLORS.muted; }}
            onClick={() => onAddRow()}
          >
            <span
              className="flex items-center gap-1.5 px-3"
              style={{ color: GRID_COLORS.muted, fontSize: 13 }}
            >
              <Plus size={14} /> New row
            </span>
          </button>
        </div>
      </div>

      {/* Row context menu */}
      {rowMenu && (
        <RowContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          record={rowMenu.record}
          onClose={() => setRowMenu(null)}
          onExpandRow={(r) => onExpandRow?.(r)}
          onDuplicateRow={(r) => onDuplicateRow?.(r)}
          onDeleteRow={(id) => onDeleteRow?.(id)}
          onInsertAbove={(record) => {
            const idx = records.findIndex((r) => r.id === record.id);
            const prev = idx > 0 ? records[idx - 1] : null;
            const curOrder = record.nc_order ?? idx;
            const prevOrder = prev ? (prev.nc_order ?? idx - 1) : curOrder - 1;
            onAddRow({ nc_order: (prevOrder + curOrder) / 2 });
          }}
          onInsertBelow={(record) => {
            const idx = records.findIndex((r) => r.id === record.id);
            const next = idx < records.length - 1 ? records[idx + 1] : null;
            const curOrder = record.nc_order ?? idx;
            const nextOrder = next ? (next.nc_order ?? idx + 1) : curOrder + 1;
            onAddRow({ nc_order: (curOrder + nextOrder) / 2 });
          }}
        />
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
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 40,
          borderTop: `1px solid ${GRID_COLORS.border}`,
          backgroundColor: GRID_COLORS.headerBg,
          fontSize: 13,
          color: GRID_COLORS.muted,
        }}
      >
        <div className="flex items-center gap-3">
          <span>
            {totalCount} record{totalCount !== 1 ? 's' : ''}
          </span>
          {frozenCount > 0 && (
            <button
              className="flex items-center gap-1 font-medium hover:underline"
              style={{ color: GRID_COLORS.primary }}
              onClick={() => setFrozenColumns(0)}
              title="Click to unfreeze"
            >
              <Lock size={12} /> {frozenCount} frozen
            </button>
          )}
          {selectedRowIds.size > 0 && (
            <span className="font-medium" style={{ color: GRID_COLORS.primary }}>
              ({selectedRowIds.size} selected)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)] disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page + 1} of {Math.max(totalPages, 1)}
          </span>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[hsl(200,25%,18%)] disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
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
            backgroundColor: GRID_COLORS.text,
            color: GRID_COLORS.bg,
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
