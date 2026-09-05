import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Filter, ArrowUpDown, EyeOff, Search, Plus, Rows3, X, Undo2, Redo2, Download, Upload, MoreHorizontal, Layers, Palette, GripVertical, ChevronUp, ChevronDown, FolderPlus, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseUI } from '../lib/store';
import { useUndoStore } from '../lib/undo';
import { useFields, useRecords, useCreateView } from '../hooks';
import { CreateFieldDialog } from './CreateFieldDialog';
const ImportCsvDialog = lazy(() => import('./ImportCsvDialog').then(m => ({ default: m.ImportCsvDialog })));
import { exportToCsv } from '../lib/csv';
import { useTables } from '../hooks';
import type { Filter as FilterType, FilterGroup, Sort, Group, FilterOperator, RowColorRule, FieldMeta } from '../types';
import { OPERATORS_BY_TYPE } from '../types';

const OPERATOR_LABELS: Record<string, string> = {
  is: 'is',
  isNot: 'is not',
  contains: 'contains',
  doesNotContain: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  isBefore: 'is before',
  isAfter: 'is after',
  isOnOrBefore: 'is on or before',
  isOnOrAfter: 'is on or after',
  isBetween: 'is between',
  isWithin: 'is within',
  isWithinPastWeek: 'is within past week',
  isWithinPastMonth: 'is within past month',
  isWithinPastYear: 'is within past year',
  isAnyOf: 'is any of',
  isNoneOf: 'is none of',
  isExactly: 'is exactly',
  containsAnyOf: 'contains any of',
  doesNotContainAnyOf: 'does not contain any of',
  isChecked: 'is checked',
  isNotChecked: 'is not checked',
};

const NO_VALUE_OPERATORS = new Set<string>([
  'isEmpty', 'isNotEmpty', 'isChecked', 'isNotChecked',
  'isWithinPastWeek', 'isWithinPastMonth', 'isWithinPastYear',
]);

function FilterValueInput({
  filter,
  field,
  onChange,
}: {
  filter: FilterType;
  field: FieldMeta | undefined;
  onChange: (value: any) => void;
}) {
  if (NO_VALUE_OPERATORS.has(filter.operator)) return null;

  const uiType = field?.ui_type;

  // Select fields: show a dropdown of choices
  if (
    (uiType === 'SingleSelect' || uiType === 'MultiSelect') &&
    field?.options?.choices &&
    field.options.choices.length > 0
  ) {
    return (
      <select
        className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[120px]"
        value={filter.value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {field.options.choices.map((c) => (
          <option key={c.title} value={c.title}>{c.title}</option>
        ))}
      </select>
    );
  }

  // Date fields: use date input
  if (uiType === 'Date' || uiType === 'DateTime') {
    return (
      <input
        type="date"
        className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[130px]"
        value={filter.value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Number fields
  if (uiType === 'Number' || uiType === 'Currency' || uiType === 'Percent' || uiType === 'Decimal') {
    return (
      <input
        type="number"
        className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[120px]"
        value={filter.value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
      />
    );
  }

  return (
    <input
      className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[120px]"
      value={filter.value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
    />
  );
}

function FilterRuleRow({
  filter,
  index,
  filterableFields,
  onUpdate,
  onRemove,
  isFocused,
}: {
  filter: FilterType;
  index: number;
  filterableFields: FieldMeta[];
  onUpdate: (id: string, updates: Partial<FilterType>) => void;
  onRemove: (id: string) => void;
  isFocused: boolean;
}) {
  const field = filterableFields.find((f) => f.id === filter.field_id);
  const ops = field ? (OPERATORS_BY_TYPE[field.ui_type] ?? ['is', 'isNot']) : (['is'] as FilterOperator[]);

  return (
    <div
      className={`flex items-center gap-2 mb-2 px-1 py-0.5 rounded ${isFocused ? 'ring-1 ring-[#2D7FF9] bg-[#2D7FF9]/5' : ''}`}
    >
      {index > 0 ? (
        <select
          className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1 py-0.5 text-[#6A7184] dark:text-[hsl(200,20%,55%)] dark:bg-[hsl(200,30%,12%)]"
          value={filter.conjunction}
          onChange={(e) => onUpdate(filter.id, { conjunction: e.target.value as 'and' | 'or' })}
        >
          <option value="and">And</option>
          <option value="or">Or</option>
        </select>
      ) : (
        <span className="text-[11px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] w-8">Where</span>
      )}
      <select
        className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[120px]"
        value={filter.field_id}
        onChange={(e) => {
          const newField = filterableFields.find((f) => f.id === e.target.value);
          const newOps = newField ? (OPERATORS_BY_TYPE[newField.ui_type] ?? ['is', 'isNot']) : ['is'];
          onUpdate(filter.id, { field_id: e.target.value, operator: newOps[0] as FilterOperator, value: '' });
        }}
      >
        {filterableFields.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      <select
        className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)]"
        value={filter.operator}
        onChange={(e) => onUpdate(filter.id, { operator: e.target.value as FilterOperator })}
      >
        {ops.map((op) => (
          <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
        ))}
      </select>
      <FilterValueInput
        filter={filter}
        field={field}
        onChange={(value) => onUpdate(filter.id, { value })}
      />
      <button onClick={() => onRemove(filter.id)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5" aria-label="Remove filter">
        <X size={12} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
      </button>
    </div>
  );
}

function FilterGroupBlock({
  group,
  depth,
  filterableFields,
  onUpdateGroup,
  onRemoveGroup,
  focusedFilterId,
}: {
  group: FilterGroup;
  depth: number;
  filterableFields: FieldMeta[];
  onUpdateGroup: (id: string, updated: FilterGroup) => void;
  onRemoveGroup: (id: string) => void;
  focusedFilterId: string | null;
}) {
  const addFilter = () => {
    if (filterableFields.length === 0) return;
    const f = filterableFields[0];
    const ops = OPERATORS_BY_TYPE[f.ui_type] ?? ['is', 'isNot'];
    const newFilter: FilterType = {
      id: crypto.randomUUID(),
      field_id: f.id,
      operator: ops[0],
      value: '',
      conjunction: group.filters.length > 0 || group.groups.length > 0 ? group.conjunction : 'and',
    };
    onUpdateGroup(group.id, { ...group, filters: [...group.filters, newFilter] });
  };

  const addSubGroup = () => {
    const subGroup: FilterGroup = {
      id: crypto.randomUUID(),
      conjunction: 'and',
      filters: [],
      groups: [],
    };
    onUpdateGroup(group.id, { ...group, groups: [...group.groups, subGroup] });
  };

  const updateFilter = (id: string, updates: Partial<FilterType>) => {
    onUpdateGroup(group.id, {
      ...group,
      filters: group.filters.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    });
  };

  const removeFilter = (id: string) => {
    onUpdateGroup(group.id, {
      ...group,
      filters: group.filters.filter((f) => f.id !== id),
    });
  };

  const updateSubGroup = (id: string, updated: FilterGroup) => {
    onUpdateGroup(group.id, {
      ...group,
      groups: group.groups.map((g) => (g.id === id ? updated : g)),
    });
  };

  const removeSubGroup = (id: string) => {
    onUpdateGroup(group.id, {
      ...group,
      groups: group.groups.filter((g) => g.id !== id),
    });
  };

  return (
    <div
      className="relative mb-2"
      style={{ marginLeft: depth > 0 ? 16 : 0 }}
    >
      {depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#2D7FF9]/30 rounded" style={{ left: -8 }} />
      )}
      {depth > 0 && (
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <ChevronRight size={10} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
            <select
              className="text-[10px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1 py-0.5 text-[#6A7184] dark:bg-[hsl(200,30%,12%)] font-medium"
              value={group.conjunction}
              onChange={(e) => onUpdateGroup(group.id, { ...group, conjunction: e.target.value as 'and' | 'or' })}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
            <span className="text-[10px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]">group</span>
          </div>
          <button onClick={() => onRemoveGroup(group.id)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5">
            <X size={11} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
          </button>
        </div>
      )}
      {group.filters.map((filter, i) => (
        <FilterRuleRow
          key={filter.id}
          filter={filter}
          index={i}
          filterableFields={filterableFields}
          onUpdate={updateFilter}
          onRemove={removeFilter}
          isFocused={focusedFilterId === filter.id}
        />
      ))}
      {group.groups.map((subGroup) => (
        <FilterGroupBlock
          key={subGroup.id}
          group={subGroup}
          depth={depth + 1}
          filterableFields={filterableFields}
          onUpdateGroup={updateSubGroup}
          onRemoveGroup={removeSubGroup}
          focusedFilterId={focusedFilterId}
        />
      ))}
      <div className="flex items-center gap-2 mt-1">
        <button className="text-[11px] text-[#2D7FF9] hover:underline" onClick={addFilter}>
          + Add filter
        </button>
        {depth < 2 && (
          <button className="text-[11px] text-[#2D7FF9] hover:underline" onClick={addSubGroup}>
            + Add filter group
          </button>
        )}
      </div>
    </div>
  );
}

function FilterPanel({ onClose, onSaveAsView }: { onClose: () => void; onSaveAsView: () => void }) {
  const { filters, setFilters, filterGroups, setFilterGroups, activeTableId, focusedFilterId, setFocusedFilterId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const filterableFields = useMemo(
    () => (fields ?? []).filter((f: FieldMeta) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  const addFilter = () => {
    if (filterableFields.length === 0) return;
    const f = filterableFields[0];
    const ops = OPERATORS_BY_TYPE[f.ui_type] ?? ['is', 'isNot'];
    const newFilter: FilterType = {
      id: crypto.randomUUID(),
      field_id: f.id,
      operator: ops[0],
      value: '',
      conjunction: filters.length > 0 ? 'and' : 'and',
    };
    setFilters([...filters, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<FilterType>) => {
    setFilters(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter((f) => f.id !== id));
    if (focusedFilterId === id) setFocusedFilterId(null);
  };

  const addFilterGroup = () => {
    const group: FilterGroup = {
      id: crypto.randomUUID(),
      conjunction: 'and',
      filters: [],
      groups: [],
    };
    setFilterGroups([...filterGroups, group]);
  };

  const updateGroup = (id: string, updated: FilterGroup) => {
    setFilterGroups(filterGroups.map((g) => (g.id === id ? updated : g)));
  };

  const removeGroup = (id: string) => {
    setFilterGroups(filterGroups.filter((g) => g.id !== id));
  };

  const totalFilterCount = filters.length + filterGroups.reduce(function countGroup(acc: number, g: FilterGroup): number {
    return acc + g.filters.length + g.groups.reduce(countGroup, 0);
  }, 0);

  const clearAll = () => {
    setFilters([]);
    setFilterGroups([]);
    setFocusedFilterId(null);
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg p-3 min-w-[480px] max-h-[420px] overflow-y-auto animate-[panelSlideDown_150ms_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Filters</span>
        <div className="flex items-center gap-2">
          {totalFilterCount > 0 && (
            <button onClick={clearAll} className="text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]">
              Clear all
            </button>
          )}
          <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5"><X size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" /></button>
        </div>
      </div>

      {/* Top-level filters */}
      {filters.map((filter, i) => (
        <FilterRuleRow
          key={filter.id}
          filter={filter}
          index={i}
          filterableFields={filterableFields}
          onUpdate={updateFilter}
          onRemove={removeFilter}
          isFocused={focusedFilterId === filter.id}
        />
      ))}

      {/* Filter groups */}
      {filterGroups.map((group) => (
        <FilterGroupBlock
          key={group.id}
          group={group}
          depth={1}
          filterableFields={filterableFields}
          onUpdateGroup={updateGroup}
          onRemoveGroup={removeGroup}
          focusedFilterId={focusedFilterId}
        />
      ))}

      <div className="flex items-center gap-3 mt-1">
        <button className="text-[11px] text-[#2D7FF9] hover:underline" onClick={addFilter}>
          + Add filter
        </button>
        <button className="text-[11px] text-[#2D7FF9] hover:underline" onClick={addFilterGroup}>
          + Add filter group
        </button>
      </div>

      {/* Save as view */}
      {totalFilterCount > 0 && (
        <div className="mt-3 pt-2 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
          <button
            className="flex items-center gap-1.5 text-[11px] text-[#2D7FF9] hover:underline"
            onClick={onSaveAsView}
          >
            <FolderPlus size={12} /> Save as new view
          </button>
        </div>
      )}
    </div>
  );
}

function QuickFilterBar() {
  const { filters, setFilters, filterGroups, activeTableId, focusedFilterId, setFocusedFilterId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const filterableFields = useMemo(
    () => (fields ?? []).filter((f: FieldMeta) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  const totalCount = filters.length + filterGroups.reduce(function countGroup(acc: number, g: FilterGroup): number {
    return acc + g.filters.length + g.groups.reduce(countGroup, 0);
  }, 0);

  if (totalCount === 0) return null;

  const getFieldName = (fieldId: string) => filterableFields.find((f) => f.id === fieldId)?.name ?? 'Unknown';

  const formatPill = (filter: FilterType) => {
    const fieldName = getFieldName(filter.field_id);
    const opLabel = OPERATOR_LABELS[filter.operator] ?? filter.operator;
    if (NO_VALUE_OPERATORS.has(filter.operator)) {
      return `${fieldName} ${opLabel}`;
    }
    const val = filter.value != null && filter.value !== '' ? String(filter.value) : '...';
    return `${fieldName} ${opLabel} ${val}`;
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F4F4F5] dark:bg-[hsl(200,35%,8%)] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] overflow-x-auto shrink-0">
      <span className="text-[10px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] shrink-0 mr-0.5">Filtered by:</span>
      {filters.map((filter) => (
        <button
          key={filter.id}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 transition-colors ${
            focusedFilterId === filter.id
              ? 'bg-[#2D7FF9]/10 border-[#2D7FF9]/30 text-[#2D7FF9]'
              : 'bg-white dark:bg-[hsl(200,30%,12%)] border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#374151] dark:text-[hsl(200,25%,88%)] hover:border-[#2D7FF9]/40'
          }`}
          onClick={() => setFocusedFilterId(focusedFilterId === filter.id ? null : filter.id)}
          title={formatPill(filter)}
        >
          <span className="max-w-[180px] truncate">{formatPill(filter)}</span>
          <span
            className="ml-0.5 hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              setFilters(filters.filter((f) => f.id !== filter.id));
              if (focusedFilterId === filter.id) setFocusedFilterId(null);
            }}
          >
            <X size={10} />
          </span>
        </button>
      ))}
      {filterGroups.length > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2D7FF9]/10 border border-[#2D7FF9]/20 text-[#2D7FF9] shrink-0">
          +{filterGroups.length} group{filterGroups.length > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function SaveFilterAsViewDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const { filters, filterGroups, sorts, groupByLevels, activeTableId } = useDatabaseUI();
  const createView = useCreateView();

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim() || !activeTableId) return;
    createView.mutate({
      table_id: activeTableId,
      name: name.trim(),
      type: 'grid',
      filters,
      sorts,
      groups: groupByLevels,
    });
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-xl p-4 w-80">
        <h3 className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] mb-3">Save filters as view</h3>
        <input
          type="text"
          autoFocus
          placeholder="View name"
          className="w-full px-2 py-1.5 text-[12px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] focus:border-[#2D7FF9] mb-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        />
        <p className="text-[10px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] mb-3">
          {filters.length} filter{filters.length !== 1 ? 's' : ''}{filterGroups.length > 0 ? ` + ${filterGroups.length} group${filterGroups.length > 1 ? 's' : ''}` : ''} will be saved to this view.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            className="px-3 py-1 text-[11px] rounded border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:bg-gray-50 dark:hover:bg-white/5"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 text-[11px] rounded bg-[#2D7FF9] text-white hover:bg-[#2952CC] disabled:opacity-40"
            disabled={!name.trim()}
            onClick={handleSave}
          >
            Save view
          </button>
        </div>
      </div>
    </div>
  );
}

function SortPanel({ onClose }: { onClose: () => void }) {
  const { sorts, setSorts, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const sortableFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  const addSort = () => {
    if (sortableFields.length === 0) return;
    const f = sortableFields[0];
    setSorts([...sorts, { field_id: f.id, direction: 'asc' }]);
  };

  const updateSort = (i: number, updates: Partial<Sort>) => {
    const next = sorts.map((s, idx) => (idx === i ? { ...s, ...updates } : s));
    setSorts(next);
  };

  const removeSort = (i: number) => {
    setSorts(sorts.filter((_, idx) => idx !== i));
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white dark:bg-[hsl(200,25%,13%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg p-3 min-w-[320px] animate-[panelSlideDown_150ms_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Sort</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]"><X size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" /></button>
      </div>
      {sorts.map((sort, i) => (
        <div key={`${sort.field_id}-${i}`} className="flex items-center gap-2 mb-2">
          <select
            className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1"
            value={sort.field_id}
            onChange={(e) => updateSort(i, { field_id: e.target.value })}
          >
            {sortableFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select
            className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)]"
            value={sort.direction}
            onChange={(e) => updateSort(i, { direction: e.target.value as 'asc' | 'desc' })}
          >
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
          <button onClick={() => removeSort(i)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]">
            <X size={12} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
          </button>
        </div>
      ))}
      <button className="text-[11px] text-[#2D7FF9] hover:underline" onClick={addSort}>
        + Add sort
      </button>
    </div>
  );
}

function GroupPanel({ onClose }: { onClose: () => void }) {
  const { groupByLevels, setGroupByLevels, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const groupableFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  const addLevel = (fieldId: string) => {
    if (groupByLevels.length >= 3) return;
    setGroupByLevels([...groupByLevels, { field_id: fieldId, direction: 'asc' }]);
  };

  const updateLevel = (i: number, updates: Partial<Group>) => {
    setGroupByLevels(groupByLevels.map((g, idx) => (idx === i ? { ...g, ...updates } : g)));
  };

  const removeLevel = (i: number) => {
    setGroupByLevels(groupByLevels.filter((_, idx) => idx !== i));
  };

  const usedFieldIds = new Set(groupByLevels.map((g) => g.field_id));
  const availableFields = groupableFields.filter((f) => !usedFieldIds.has(f.id));

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg p-3 min-w-[320px] animate-[panelSlideDown_150ms_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Group by</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5"><X size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" /></button>
      </div>
      {groupableFields.length === 0 ? (
        <p className="text-[11px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]">No fields available for grouping.</p>
      ) : (
        <>
          {groupByLevels.map((level, i) => (
            <div key={`${level.field_id}-${i}`} className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] w-10 shrink-0">{i === 0 ? 'Group' : 'Then'}</span>
              <select
                className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1"
                value={level.field_id}
                onChange={(e) => updateLevel(i, { field_id: e.target.value })}
              >
                {groupableFields.map((f) => (
                  <option key={f.id} value={f.id} disabled={usedFieldIds.has(f.id) && f.id !== level.field_id}>{f.name}</option>
                ))}
              </select>
              <select
                className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)]"
                value={level.direction}
                onChange={(e) => updateLevel(i, { direction: e.target.value as 'asc' | 'desc' })}
              >
                <option value="asc">A &rarr; Z</option>
                <option value="desc">Z &rarr; A</option>
              </select>
              <button onClick={() => removeLevel(i)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5">
                <X size={12} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
              </button>
            </div>
          ))}
          {groupByLevels.length < 3 && availableFields.length > 0 && (
            groupByLevels.length === 0 ? (
              <div className="flex items-center gap-2">
                <select
                  className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1"
                  value=""
                  onChange={(e) => addLevel(e.target.value)}
                >
                  <option value="" disabled>Pick a field...</option>
                  {availableFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <button
                className="text-[11px] text-[#2D7FF9] hover:underline"
                onClick={() => addLevel(availableFields[0].id)}
              >
                + Add sub-group
              </button>
            )
          )}
          {groupByLevels.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
              <button
                className="text-[11px] text-[#2D7FF9] hover:underline"
                onClick={() => setGroupByLevels([])}
              >
                Clear grouping
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HideFieldsPanel({ onClose }: { onClose: () => void }) {
  const { hiddenFieldIds, toggleHiddenField, activeTableId, fieldOrder, setFieldOrder } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const allFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  // Order fields: use fieldOrder if set, otherwise fall back to position
  const orderedFields = useMemo(() => {
    if (fieldOrder.length > 0) {
      const byId = new Map(allFields.map((f) => [f.id, f]));
      const ordered: typeof allFields = [];
      for (const id of fieldOrder) {
        const f = byId.get(id);
        if (f) { ordered.push(f); byId.delete(id); }
      }
      // Append any fields not in the order array
      for (const f of allFields.sort((a, b) => a.position - b.position)) {
        if (byId.has(f.id)) ordered.push(f);
      }
      return ordered;
    }
    return [...allFields].sort((a, b) => a.position - b.position);
  }, [allFields, fieldOrder]);

  const allHidden = orderedFields.every((f) => hiddenFieldIds.has(f.id));
  const noneHidden = orderedFields.every((f) => !hiddenFieldIds.has(f.id));

  const showAll = () => {
    for (const f of orderedFields) {
      if (hiddenFieldIds.has(f.id)) toggleHiddenField(f.id);
    }
  };

  const hideAll = () => {
    for (const f of orderedFields) {
      if (!hiddenFieldIds.has(f.id)) toggleHiddenField(f.id);
    }
  };

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    const ids = orderedFields.map((f) => f.id);
    const idx = ids.indexOf(fieldId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    const next = [...ids];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setFieldOrder(next);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const filtered = searchTerm
    ? orderedFields.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : orderedFields;

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg p-3 min-w-[280px] max-h-[360px] flex flex-col animate-[panelSlideDown_150ms_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Fields</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5"><X size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" /></button>
      </div>
      <input
        type="text"
        placeholder="Search fields..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-2 py-1 mb-2 text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] focus:border-[#2D7FF9]"
      />
      <div className="flex items-center gap-2 mb-2">
        <button
          className="text-[10px] text-[#2D7FF9] hover:underline disabled:opacity-40"
          onClick={showAll}
          disabled={noneHidden}
        >
          Show all
        </button>
        <span className="text-[10px] text-[#E5E5E5] dark:text-[hsl(200,25%,18%)]">|</span>
        <button
          className="text-[10px] text-[#2D7FF9] hover:underline disabled:opacity-40"
          onClick={hideAll}
          disabled={allHidden}
        >
          Hide all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((f, i) => (
          <div key={f.id} className="flex items-center gap-1 py-1 hover:bg-[#F4F4F5] dark:hover:bg-white/5 rounded px-1 -mx-1">
            <GripVertical size={12} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] shrink-0 cursor-grab" />
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-[#2D7FF9] shrink-0"
              checked={!hiddenFieldIds.has(f.id)}
              onChange={() => toggleHiddenField(f.id)}
            />
            <span className="text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] truncate flex-1">{f.name}</span>
            <button
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-20"
              disabled={!searchTerm && i === 0}
              onClick={() => moveField(f.id, 'up')}
              title="Move up"
            >
              <ChevronUp size={12} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />
            </button>
            <button
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-20"
              disabled={!searchTerm && i === filtered.length - 1}
              onClick={() => moveField(f.id, 'down')}
              title="Move down"
            >
              <ChevronDown size={12} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROW_COLOR_PRESETS = [
  { name: 'Red', color: '#FEE2E2' },
  { name: 'Orange', color: '#FFEDD5' },
  { name: 'Yellow', color: '#FEF9C3' },
  { name: 'Green', color: '#DCFCE7' },
  { name: 'Blue', color: '#DBEAFE' },
  { name: 'Purple', color: '#F3E8FF' },
  { name: 'Pink', color: '#FCE7F3' },
];

const COLOR_OPERATORS: FilterOperator[] = ['is', 'isNot', 'contains', 'isEmpty', 'isNotEmpty'];

function ColorPanel({ onClose }: { onClose: () => void }) {
  const { rowColorRules, setRowColorRules, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const colorableFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  const addRule = () => {
    if (colorableFields.length === 0) return;
    const newRule: RowColorRule = {
      id: crypto.randomUUID(),
      field_id: colorableFields[0].id,
      operator: 'is',
      value: '',
      color: ROW_COLOR_PRESETS[0].color,
    };
    setRowColorRules([...rowColorRules, newRule]);
  };

  const updateRule = (id: string, updates: Partial<RowColorRule>) => {
    setRowColorRules(rowColorRules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const removeRule = (id: string) => {
    setRowColorRules(rowColorRules.filter((r) => r.id !== id));
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white dark:bg-[hsl(200,25%,13%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg p-3 min-w-[440px] animate-[panelSlideDown_150ms_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Row coloring</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]"><X size={14} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" /></button>
      </div>
      {rowColorRules.map((rule) => {
        const ops = COLOR_OPERATORS;
        return (
          <div key={rule.id} className="flex items-center gap-2 mb-2">
            <select
              className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[110px]"
              value={rule.field_id}
              onChange={(e) => updateRule(rule.id, { field_id: e.target.value })}
            >
              {colorableFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)]"
              value={rule.operator}
              onChange={(e) => updateRule(rule.id, { operator: e.target.value as FilterOperator })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
              ))}
            </select>
            {rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' && (
              <input
                className="text-[11px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,12%)] flex-1 max-w-[90px]"
                value={rule.value ?? ''}
                onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                placeholder="Value"
              />
            )}
            <div className="flex items-center gap-0.5">
              {ROW_COLOR_PRESETS.map((p) => (
                <button
                  key={p.color}
                  className="w-5 h-5 rounded border"
                  style={{
                    backgroundColor: p.color,
                    borderColor: rule.color === p.color ? '#374151' : '#E5E5E5',
                    borderWidth: rule.color === p.color ? 2 : 1,
                  }}
                  title={p.name}
                  onClick={() => updateRule(rule.id, { color: p.color })}
                />
              ))}
            </div>
            <button onClick={() => removeRule(rule.id)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]">
              <X size={12} className="text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
            </button>
          </div>
        );
      })}
      <button
        className="text-[11px] text-[#2D7FF9] hover:underline"
        onClick={addRule}
      >
        + Add color rule
      </button>
    </div>
  );
}

export function Toolbar() {
  const { rowHeight, setRowHeight, searchQuery, setSearchQuery, filters, filterGroups, sorts, groupByLevels, activeBaseId, activeTableId, rowColorRules } = useDatabaseUI();
  const { undo, redo, stack, redoStack } = useUndoStore();
  const { data: fieldsData } = useFields(activeTableId);
  const { data: recordsData } = useRecords({ baseId: activeBaseId!, tableId: activeTableId!, pageSize: 10000 });
  const { data: tablesData } = useTables(activeBaseId);
  const tableName = tablesData?.find((t) => t.id === activeTableId)?.name ?? 'table';
  const [searchOpen, setSearchOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [saveFilterViewOpen, setSaveFilterViewOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const closeAllPanels = useCallback(() => {
    setFilterOpen(false);
    setSortOpen(false);
    setHideOpen(false);
    setGroupOpen(false);
    setColorOpen(false);
  }, []);

  const totalFilterCount = filters.length + filterGroups.reduce(function countGroup(acc: number, g: FilterGroup): number {
    return acc + g.filters.length + g.groups.reduce(countGroup, 0);
  }, 0);

  const ROW_HEIGHT_OPTIONS: { value: 'short' | 'medium' | 'tall' | 'extra-tall'; label: string; px: number }[] = [
    { value: 'short', label: 'Short', px: 32 },
    { value: 'medium', label: 'Medium', px: 44 },
    { value: 'tall', label: 'Tall', px: 64 },
    { value: 'extra-tall', label: 'Extra Tall', px: 100 },
  ];

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [setSearchQuery],
  );

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  return (
    <>
      <div className="flex items-center justify-between h-[36px] px-3 bg-white dark:bg-zinc-900 border-b border-[#E5E5E5] dark:border-zinc-700/60 shrink-0">
        {/* Left: view controls */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-[13px] gap-1 ${totalFilterCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}
              onClick={() => { setFilterOpen(!filterOpen); setSortOpen(false); setHideOpen(false); setGroupOpen(false); setColorOpen(false); }}
            >
              <Filter size={14} /> Filter
              {totalFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none">
                  {totalFilterCount}
                </span>
              )}
            </Button>
            {filterOpen && <FilterPanel onClose={() => setFilterOpen(false)} onSaveAsView={() => { setFilterOpen(false); setSaveFilterViewOpen(true); }} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-[13px] gap-1 ${sorts.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}
              onClick={() => { setSortOpen(!sortOpen); setFilterOpen(false); setHideOpen(false); setGroupOpen(false); setColorOpen(false); }}
            >
              <ArrowUpDown size={14} /> Sort{sorts.length > 0 ? ` (${sorts.length})` : ''}
            </Button>
            {sortOpen && <SortPanel onClose={() => setSortOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-[13px] gap-1 ${groupByLevels.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}
              onClick={() => { setGroupOpen(!groupOpen); setFilterOpen(false); setSortOpen(false); setHideOpen(false); setColorOpen(false); }}
            >
              <Layers size={14} /> Group{groupByLevels.length > 0 ? ` (${groupByLevels.length})` : ''}
            </Button>
            {groupOpen && <GroupPanel onClose={() => setGroupOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[13px] text-zinc-500 dark:text-zinc-400 gap-1"
              onClick={() => { setHideOpen(!hideOpen); setFilterOpen(false); setSortOpen(false); setGroupOpen(false); setColorOpen(false); }}
            >
              <EyeOff size={14} /> Fields
            </Button>
            {hideOpen && <HideFieldsPanel onClose={() => setHideOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-[13px] gap-1 ${rowColorRules.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}
              onClick={() => { setColorOpen(!colorOpen); setFilterOpen(false); setSortOpen(false); setHideOpen(false); setGroupOpen(false); }}
            >
              <Palette size={14} /> Color{rowColorRules.length > 0 ? ` (${rowColorRules.length})` : ''}
            </Button>
            {colorOpen && <ColorPanel onClose={() => setColorOpen(false)} />}
          </div>
        </div>

        {/* Right: search, overflow menu, + Field */}
        <div className="flex items-center gap-1">
          {searchOpen ? (
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search..."
                className="h-7 w-48 text-xs pl-2 pr-6 border border-zinc-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <button
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                aria-label="Close search"
              >
                <X size={12} className="text-zinc-400 dark:text-zinc-500" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-zinc-500 dark:text-zinc-400 gap-1"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <Search size={14} />
            </Button>
          )}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-zinc-500 dark:text-zinc-400 gap-1"
              onClick={() => { setMoreOpen(!moreOpen); closeAllPanels(); }}
              aria-label="More options"
            >
              <MoreHorizontal size={14} />
            </Button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[180px]">
                  {/* Row height */}
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Row height</div>
                  {ROW_HEIGHT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center justify-between text-zinc-700 dark:text-zinc-200"
                      onClick={() => { setRowHeight(opt.value); setMoreOpen(false); }}
                    >
                      <span className="flex items-center gap-2">
                        <Rows3 size={14} className="text-zinc-400 dark:text-zinc-500" />
                        {opt.label}
                      </span>
                      {rowHeight === opt.value && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                    </button>
                  ))}
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                  {/* Undo / Redo */}
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-200 disabled:opacity-30"
                    disabled={stack.length === 0}
                    onClick={() => { undo(); setMoreOpen(false); }}
                  >
                    <Undo2 size={14} className="text-zinc-400 dark:text-zinc-500" /> Undo
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-200 disabled:opacity-30"
                    disabled={redoStack.length === 0}
                    onClick={() => { redo(); setMoreOpen(false); }}
                  >
                    <Redo2 size={14} className="text-zinc-400 dark:text-zinc-500" /> Redo
                  </button>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                  {/* Import / Export */}
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-200"
                    onClick={() => {
                      if (fieldsData && recordsData?.records) {
                        exportToCsv(fieldsData, recordsData.records, tableName);
                      }
                      setMoreOpen(false);
                    }}
                  >
                    <Download size={14} className="text-zinc-400 dark:text-zinc-500" /> Download CSV
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-200"
                    onClick={() => {
                      setImportCsvOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    <Upload size={14} className="text-zinc-400 dark:text-zinc-500" /> Import CSV
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-blue-600 dark:text-blue-400 gap-1 px-2 font-medium hover:bg-blue-50 dark:hover:bg-blue-500/10"
            onClick={() => setFieldDialogOpen(true)}
            title="Add new field"
          >
            <Plus size={14} /> Field
          </Button>
        </div>
      </div>
      <QuickFilterBar />
      <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />
      <SaveFilterAsViewDialog open={saveFilterViewOpen} onClose={() => setSaveFilterViewOpen(false)} />
      {importCsvOpen && <Suspense fallback={null}><ImportCsvDialog open={importCsvOpen} onOpenChange={setImportCsvOpen} /></Suspense>}
    </>
  );
}
