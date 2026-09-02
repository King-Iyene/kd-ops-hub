import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Filter, ArrowUpDown, EyeOff, Search, Plus, Rows3, X, Undo2, Redo2, Download, Upload, MoreHorizontal, Layers, Palette, Replace, Printer, FileJson, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseUI } from '../lib/store';
import { useUndoStore } from '../lib/undo';
import { useFields, useRecords } from '../hooks';
import { CreateFieldDialog } from './CreateFieldDialog';
import { ImportCsvDialog } from './ImportCsvDialog';
import { SearchReplaceDialog } from './SearchReplaceDialog';
import { exportToCsv, exportToJson } from '../lib/csv';
import { useTables } from '../hooks';
import { PrintView } from './PrintView';
import type { Filter as FilterType, Sort, Group, FilterOperator, RowColorRule } from '../types';
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
  isAnyOf: 'is any of',
  isNoneOf: 'is none of',
  isExactly: 'is exactly',
};

function FilterPanel({ onClose }: { onClose: () => void }) {
  const { filters, setFilters, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const filterableFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID'),
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
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white border border-[#E7E7E9] rounded-lg shadow-lg p-3 min-w-[400px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151]">Filters</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100"><X size={14} className="text-[#9AA2AF]" /></button>
      </div>
      {filters.map((filter, i) => {
        const field = filterableFields.find((f) => f.id === filter.field_id);
        const ops = field ? (OPERATORS_BY_TYPE[field.ui_type] ?? ['is', 'isNot']) : ['is'];
        return (
          <div key={filter.id} className="flex items-center gap-2 mb-2">
            {i > 0 && (
              <select
                className="text-[11px] border border-[#E7E7E9] rounded px-1 py-0.5 text-[#6A7184]"
                value={filter.conjunction}
                onChange={(e) => updateFilter(filter.id, { conjunction: e.target.value as 'and' | 'or' })}
              >
                <option value="and">And</option>
                <option value="or">Or</option>
              </select>
            )}
            {i === 0 && <span className="text-[11px] text-[#9AA2AF] w-8">Where</span>}
            <select
              className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1 max-w-[120px]"
              value={filter.field_id}
              onChange={(e) => updateFilter(filter.id, { field_id: e.target.value })}
            >
              {filterableFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151]"
              value={filter.operator}
              onChange={(e) => updateFilter(filter.id, { operator: e.target.value as FilterOperator })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
              ))}
            </select>
            {filter.operator !== 'isEmpty' && filter.operator !== 'isNotEmpty' && (
              <input
                className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1 max-w-[120px]"
                value={filter.value ?? ''}
                onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                placeholder="Value"
              />
            )}
            <button onClick={() => removeFilter(filter.id)} className="p-0.5 rounded hover:bg-gray-100">
              <X size={12} className="text-[#9AA2AF]" />
            </button>
          </div>
        );
      })}
      <button
        className="text-[11px] text-[#3366FF] hover:underline"
        onClick={addFilter}
      >
        + Add filter
      </button>
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
    <div className="absolute left-0 top-full z-40 mt-1 bg-white border border-[#E7E7E9] rounded-lg shadow-lg p-3 min-w-[320px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151]">Sort</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100"><X size={14} className="text-[#9AA2AF]" /></button>
      </div>
      {sorts.map((sort, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <select
            className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1"
            value={sort.field_id}
            onChange={(e) => updateSort(i, { field_id: e.target.value })}
          >
            {sortableFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select
            className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151]"
            value={sort.direction}
            onChange={(e) => updateSort(i, { direction: e.target.value as 'asc' | 'desc' })}
          >
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
          <button onClick={() => removeSort(i)} className="p-0.5 rounded hover:bg-gray-100">
            <X size={12} className="text-[#9AA2AF]" />
          </button>
        </div>
      ))}
      <button className="text-[11px] text-[#3366FF] hover:underline" onClick={addSort}>
        + Add sort
      </button>
    </div>
  );
}

function GroupPanel({ onClose }: { onClose: () => void }) {
  const { groupBy, setGroupBy, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const groupableFields = useMemo(
    () => (fields ?? []).filter((f) => f.ui_type === 'SingleSelect' || f.ui_type === 'MultiSelect'),
    [fields],
  );

  const handleFieldChange = (fieldId: string) => {
    setGroupBy({ field_id: fieldId, direction: groupBy?.direction ?? 'asc' });
  };

  const handleDirectionChange = (direction: 'asc' | 'desc') => {
    if (groupBy) {
      setGroupBy({ ...groupBy, direction });
    }
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white border border-[#E7E7E9] rounded-lg shadow-lg p-3 min-w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151]">Group</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100"><X size={14} className="text-[#9AA2AF]" /></button>
      </div>
      {groupableFields.length === 0 ? (
        <p className="text-[11px] text-[#9AA2AF]">No select fields available for grouping.</p>
      ) : groupBy ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <select
              className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1"
              value={groupBy.field_id}
              onChange={(e) => handleFieldChange(e.target.value)}
            >
              {groupableFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151]"
              value={groupBy.direction}
              onChange={(e) => handleDirectionChange(e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">A &rarr; Z</option>
              <option value="desc">Z &rarr; A</option>
            </select>
          </div>
          <button
            className="text-[11px] text-[#3366FF] hover:underline"
            onClick={() => setGroupBy(null)}
          >
            Clear grouping
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <select
            className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1"
            value=""
            onChange={(e) => handleFieldChange(e.target.value)}
          >
            <option value="" disabled>Pick a field...</option>
            {groupableFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function HideFieldsPanel({ onClose }: { onClose: () => void }) {
  const { hiddenFieldIds, toggleHiddenField, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const toggleableFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID').sort((a, b) => a.position - b.position),
    [fields],
  );

  const allHidden = toggleableFields.every((f) => hiddenFieldIds.has(f.id));
  const noneHidden = toggleableFields.every((f) => !hiddenFieldIds.has(f.id));

  const showAll = () => {
    for (const f of toggleableFields) {
      if (hiddenFieldIds.has(f.id)) toggleHiddenField(f.id);
    }
  };

  const hideAll = () => {
    for (const f of toggleableFields) {
      if (!hiddenFieldIds.has(f.id)) toggleHiddenField(f.id);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const filtered = searchTerm
    ? toggleableFields.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : toggleableFields;

  return (
    <div className="absolute left-0 top-full z-40 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg p-3 min-w-[240px] max-h-[360px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">Fields</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/5"><X size={14} className="text-[#9AA2AF]" /></button>
      </div>
      <input
        type="text"
        placeholder="Search fields..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-2 py-1 mb-2 text-[11px] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded outline-none bg-white dark:bg-[hsl(200,30%,12%)] text-[#374151] dark:text-[hsl(200,25%,88%)] focus:border-[#3366FF]"
      />
      <div className="flex items-center gap-2 mb-2">
        <button
          className="text-[10px] text-[#3366FF] hover:underline disabled:opacity-40"
          onClick={showAll}
          disabled={noneHidden}
        >
          Show all
        </button>
        <span className="text-[10px] text-[#E7E7E9]">|</span>
        <button
          className="text-[10px] text-[#3366FF] hover:underline disabled:opacity-40"
          onClick={hideAll}
          disabled={allHidden}
        >
          Hide all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((f) => (
          <label key={f.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[#F4F4F5] dark:hover:bg-white/5 rounded px-1 -mx-1">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-[#3366FF]"
              checked={!hiddenFieldIds.has(f.id)}
              onChange={() => toggleHiddenField(f.id)}
            />
            <span className="text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)] truncate">{f.name}</span>
          </label>
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
    <div className="absolute left-0 top-full z-40 mt-1 bg-white border border-[#E7E7E9] rounded-lg shadow-lg p-3 min-w-[440px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151]">Row coloring</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-100"><X size={14} className="text-[#9AA2AF]" /></button>
      </div>
      {rowColorRules.map((rule) => {
        const ops = COLOR_OPERATORS;
        return (
          <div key={rule.id} className="flex items-center gap-2 mb-2">
            <select
              className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1 max-w-[110px]"
              value={rule.field_id}
              onChange={(e) => updateRule(rule.id, { field_id: e.target.value })}
            >
              {colorableFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151]"
              value={rule.operator}
              onChange={(e) => updateRule(rule.id, { operator: e.target.value as FilterOperator })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
              ))}
            </select>
            {rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' && (
              <input
                className="text-[11px] border border-[#E7E7E9] rounded px-1.5 py-1 text-[#374151] flex-1 max-w-[90px]"
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
                    borderColor: rule.color === p.color ? '#374151' : '#E7E7E9',
                    borderWidth: rule.color === p.color ? 2 : 1,
                  }}
                  title={p.name}
                  onClick={() => updateRule(rule.id, { color: p.color })}
                />
              ))}
            </div>
            <button onClick={() => removeRule(rule.id)} className="p-0.5 rounded hover:bg-gray-100">
              <X size={12} className="text-[#9AA2AF]" />
            </button>
          </div>
        );
      })}
      <button
        className="text-[11px] text-[#3366FF] hover:underline"
        onClick={addRule}
      >
        + Add color rule
      </button>
    </div>
  );
}

export function Toolbar() {
  const { rowHeight, setRowHeight, searchQuery, setSearchQuery, filters, sorts, groupBy, setGroupBy, activeBaseId, activeTableId, rowColorRules } = useDatabaseUI();
  const { undo, redo, stack, redoStack } = useUndoStore();
  const { data: fieldsData } = useFields(activeTableId);
  const { data: recordsData } = useRecords({ baseId: activeBaseId!, tableId: activeTableId!, pageSize: 10000 });
  const { data: tablesData } = useTables(activeBaseId);
  const tableName = tablesData?.find((t) => t.id === activeTableId)?.name ?? 'table';
  const [searchOpen, setSearchOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [searchReplaceOpen, setSearchReplaceOpen] = useState(false);
  const [printViewOpen, setPrintViewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const rowHeightOptions: Array<'compact' | 'default' | 'tall' | 'extra-tall'> = [
    'compact', 'default', 'tall', 'extra-tall',
  ];
  const nextHeight = () => {
    const idx = rowHeightOptions.indexOf(rowHeight);
    setRowHeight(rowHeightOptions[(idx + 1) % rowHeightOptions.length]);
  };

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [setSearchQuery],
  );

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  return (
    <>
      <div className="flex items-center justify-between h-10 px-3 bg-[#F9F9FA] dark:bg-[hsl(200,35%,6%)] border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] shrink-0">
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              style={{ color: filters.length > 0 ? '#3366FF' : '#6A7184' }}
              onClick={() => { setFilterOpen(!filterOpen); setSortOpen(false); setHideOpen(false); setGroupOpen(false); }}
            >
              <Filter size={14} /> Filter{filters.length > 0 ? ` (${filters.length})` : ''}
            </Button>
            {filterOpen && <FilterPanel onClose={() => setFilterOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              style={{ color: sorts.length > 0 ? '#3366FF' : '#6A7184' }}
              onClick={() => { setSortOpen(!sortOpen); setFilterOpen(false); setHideOpen(false); setGroupOpen(false); }}
            >
              <ArrowUpDown size={14} /> Sort{sorts.length > 0 ? ` (${sorts.length})` : ''}
            </Button>
            {sortOpen && <SortPanel onClose={() => setSortOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              style={{ color: groupBy ? '#3366FF' : '#6A7184' }}
              onClick={() => { setGroupOpen(!groupOpen); setFilterOpen(false); setSortOpen(false); setHideOpen(false); }}
            >
              <Layers size={14} /> {groupBy ? (fieldsData ?? []).find((f) => f.id === groupBy.field_id)?.name ?? 'Group' : 'Group'}
            </Button>
            {groupOpen && <GroupPanel onClose={() => setGroupOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#6A7184] gap-1"
              onClick={() => { setHideOpen(!hideOpen); setFilterOpen(false); setSortOpen(false); setGroupOpen(false); }}
            >
              <EyeOff size={14} /> Fields
            </Button>
            {hideOpen && <HideFieldsPanel onClose={() => setHideOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              style={{ color: rowColorRules.length > 0 ? '#3366FF' : '#6A7184' }}
              onClick={() => { setColorOpen(!colorOpen); setFilterOpen(false); setSortOpen(false); setHideOpen(false); setGroupOpen(false); }}
            >
              <Palette size={14} /> Color{rowColorRules.length > 0 ? ` (${rowColorRules.length})` : ''}
            </Button>
            {colorOpen && <ColorPanel onClose={() => setColorOpen(false)} />}
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#6A7184] gap-1"
              onClick={nextHeight}
            >
              <Rows3 size={14} /> {rowHeight}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#6A7184] gap-1 disabled:opacity-30"
            disabled={stack.length === 0}
            onClick={undo}
          >
            <Undo2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#6A7184] gap-1 disabled:opacity-30"
            disabled={redoStack.length === 0}
            onClick={redo}
          >
            <Redo2 size={14} />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {searchOpen ? (
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search..."
                className="h-7 w-48 text-xs pl-2 pr-6 border border-[#E7E7E9] rounded focus:outline-none focus:ring-1 focus:ring-[#3366FF]"
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <button
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              >
                <X size={12} className="text-[#9AA2AF]" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#6A7184] gap-1"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={14} />
            </Button>
          )}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#6A7184] gap-1"
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <MoreHorizontal size={14} />
            </Button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 bg-white border border-[#E7E7E9] rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                    onClick={() => {
                      if (fieldsData && recordsData?.records) {
                        exportToCsv(fieldsData, recordsData.records, tableName);
                      }
                      setMoreOpen(false);
                    }}
                  >
                    <Download size={13} className="text-[#9AA2AF]" /> Export CSV
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                    onClick={() => {
                      setImportCsvOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    <Upload size={13} className="text-[#9AA2AF]" /> Import CSV
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                    onClick={() => {
                      if (fieldsData && recordsData?.records) {
                        exportToJson(fieldsData, recordsData.records, tableName);
                      }
                      setMoreOpen(false);
                    }}
                  >
                    <FileJson size={13} className="text-[#9AA2AF]" /> Export JSON
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                    onClick={() => {
                      setPrintViewOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    <Printer size={13} className="text-[#9AA2AF]" /> Print view
                  </button>
                  <div className="h-px bg-[#E7E7E9] my-0.5" />
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] flex items-center gap-2 text-[#374151]"
                    onClick={() => {
                      setSearchReplaceOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    <Replace size={13} className="text-[#9AA2AF]" /> Search & Replace
                  </button>
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 font-medium"
            style={{ color: '#3366FF' }}
            onClick={() => setFieldDialogOpen(true)}
          >
            <Plus size={14} /> New Field
          </Button>
        </div>
      </div>
      <CreateFieldDialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen} />
      <ImportCsvDialog open={importCsvOpen} onOpenChange={setImportCsvOpen} />
      <SearchReplaceDialog open={searchReplaceOpen} onOpenChange={setSearchReplaceOpen} />
      {printViewOpen && fieldsData && recordsData?.records && (
        <PrintView
          fields={fieldsData}
          records={recordsData.records}
          tableName={tableName}
          onClose={() => setPrintViewOpen(false)}
        />
      )}
    </>
  );
}
