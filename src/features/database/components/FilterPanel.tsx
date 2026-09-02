import { useMemo } from 'react';
import { Filter as FilterIcon, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldMeta, Filter, FilterOperator } from '@/features/database/types';
import { OPERATORS_BY_TYPE } from '@/features/database/types';
import { getFieldTypeIcon } from './grid/field-icons';

interface FilterPanelProps {
  fields: FieldMeta[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  is: 'is',
  isNot: 'is not',
  contains: 'contains',
  doesNotContain: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
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

const NO_VALUE_OPS: FilterOperator[] = ['isEmpty', 'isNotEmpty'];

export function FilterPanel({ fields, filters, onFiltersChange }: FilterPanelProps) {
  const availableFields = useMemo(
    () => fields.filter((f) => !f.is_system && !f.is_hidden),
    [fields],
  );

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    fields.forEach((f) => m.set(f.id, f));
    return m;
  }, [fields]);

  function addFilter() {
    if (availableFields.length === 0) return;
    const first = availableFields[0];
    const ops = OPERATORS_BY_TYPE[first.ui_type] ?? ['is'];
    const newFilter: Filter = {
      id: crypto.randomUUID(),
      field_id: first.id,
      operator: ops[0],
      value: '',
      conjunction: 'and',
    };
    onFiltersChange([...filters, newFilter]);
  }

  function updateFilter(id: string, patch: Partial<Filter>) {
    onFiltersChange(
      filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }

  function removeFilter(id: string) {
    onFiltersChange(filters.filter((f) => f.id !== id));
  }

  function getOperators(fieldId: string): FilterOperator[] {
    const field = fieldMap.get(fieldId);
    if (!field) return ['is'];
    return OPERATORS_BY_TYPE[field.ui_type] ?? ['is'];
  }

  function renderValueInput(filter: Filter) {
    if (NO_VALUE_OPS.includes(filter.operator)) return null;

    const field = fieldMap.get(filter.field_id);
    if (!field) return null;

    const uiType = field.ui_type;

    if (uiType === 'Checkbox') {
      return (
        <Select
          value={filter.value === true || filter.value === 'true' ? 'true' : 'false'}
          onValueChange={(v) => updateFilter(filter.id, { value: v === 'true' })}
        >
          <SelectTrigger className="h-7 text-xs w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Checked</SelectItem>
            <SelectItem value="false">Unchecked</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (uiType === 'SingleSelect' && field.options.choices) {
      return (
        <Select
          value={String(filter.value ?? '')}
          onValueChange={(v) => updateFilter(filter.id, { value: v })}
        >
          <SelectTrigger className="h-7 text-xs w-[120px]">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.choices.map((c) => (
              <SelectItem key={c.title} value={c.title}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    const inputType =
      uiType === 'Number' || uiType === 'Currency' || uiType === 'Percent' || uiType === 'Decimal'
        ? 'number'
        : uiType === 'Date' || uiType === 'DateTime'
          ? 'date'
          : 'text';

    return (
      <Input
        type={inputType}
        value={String(filter.value ?? '')}
        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
        placeholder="Enter a value"
        className="h-7 text-xs w-[120px]"
      />
    );
  }

  const activeCount = filters.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
          <FilterIcon size={14} />
          Filter
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[#006994] text-white text-[10px] font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] max-h-[400px] overflow-y-auto p-3 shadow-lg" align="start">
        <div className="space-y-2">
          {filters.map((filter, idx) => {
            const Icon = getFieldTypeIcon(fieldMap.get(filter.field_id)?.ui_type ?? 'SingleLineText');
            const operators = getOperators(filter.field_id);

            return (
              <div key={filter.id} className="flex items-center gap-1.5">
                {/* Conjunction */}
                <div className="w-[52px] shrink-0">
                  {idx === 0 ? (
                    <span className="text-xs text-[#475569] pl-1">Where</span>
                  ) : (
                    <Select
                      value={filter.conjunction}
                      onValueChange={(v) =>
                        updateFilter(filter.id, { conjunction: v as 'and' | 'or' })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-[52px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">And</SelectItem>
                        <SelectItem value="or">Or</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Field */}
                <Select
                  value={filter.field_id}
                  onValueChange={(v) => {
                    const newOps = getOperators(v);
                    updateFilter(filter.id, {
                      field_id: v,
                      operator: newOps[0],
                      value: '',
                    });
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => {
                      const FIcon = getFieldTypeIcon(f.ui_type);
                      return (
                        <SelectItem key={f.id} value={f.id}>
                          <span className="flex items-center gap-1.5">
                            <FIcon size={12} className="text-[#94A3B8]" />
                            {f.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={filter.operator}
                  onValueChange={(v) =>
                    updateFilter(filter.id, {
                      operator: v as FilterOperator,
                      value: NO_VALUE_OPS.includes(v as FilterOperator) ? '' : filter.value,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op} value={op}>
                        {OPERATOR_LABELS[op] ?? op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value */}
                {renderValueInput(filter)}

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[#94A3B8] hover:text-red-500 shrink-0"
                  onClick={() => removeFilter(filter.id)}
                >
                  <X size={14} />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#E2E8F0]">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#006994] gap-1 font-medium"
            onClick={addFilter}
          >
            <Plus size={14} /> Add filter
          </Button>
          {filters.length > 0 && (
            <button
              className="text-xs text-[#94A3B8] hover:text-[#475569] transition-colors"
              onClick={() => onFiltersChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
