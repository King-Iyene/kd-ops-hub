import { useMemo } from 'react';
import { Palette, Plus, X } from 'lucide-react';
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
import type { FieldMeta, RowColorRule, FilterOperator } from '@/features/database/types';
import { OPERATORS_BY_TYPE } from '@/features/database/types';
import { getFieldTypeIcon } from './grid/field-icons';

interface RowColorPanelProps {
  fields: FieldMeta[];
  rules: RowColorRule[];
  onRulesChange: (rules: RowColorRule[]) => void;
}

const COLOR_OPTIONS = [
  { name: 'Red', value: '#FEE2E2' },
  { name: 'Orange', value: '#FFEDD5' },
  { name: 'Yellow', value: '#FEF3C7' },
  { name: 'Green', value: '#D1FAE5' },
  { name: 'Blue', value: '#DBEAFE' },
  { name: 'Purple', value: '#EDE9FE' },
  { name: 'Pink', value: '#FCE7F3' },
  { name: 'Gray', value: '#F1F5F9' },
];

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

export function RowColorPanel({ fields, rules, onRulesChange }: RowColorPanelProps) {
  const availableFields = useMemo(
    () => fields.filter((f) => !f.is_system && !f.is_hidden),
    [fields],
  );

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    fields.forEach((f) => m.set(f.id, f));
    return m;
  }, [fields]);

  function addRule() {
    if (availableFields.length === 0) return;
    const first = availableFields[0];
    const ops = OPERATORS_BY_TYPE[first.ui_type] ?? ['is'];
    const newRule: RowColorRule = {
      id: crypto.randomUUID(),
      field_id: first.id,
      operator: ops[0],
      value: '',
      color: COLOR_OPTIONS[0].value,
    };
    onRulesChange([...rules, newRule]);
  }

  function updateRule(id: string, patch: Partial<RowColorRule>) {
    onRulesChange(
      rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function removeRule(id: string) {
    onRulesChange(rules.filter((r) => r.id !== id));
  }

  function getOperators(fieldId: string): FilterOperator[] {
    const field = fieldMap.get(fieldId);
    if (!field) return ['is'];
    return OPERATORS_BY_TYPE[field.ui_type] ?? ['is'];
  }

  function renderValueInput(rule: RowColorRule) {
    if (NO_VALUE_OPS.includes(rule.operator)) return null;

    const field = fieldMap.get(rule.field_id);
    if (!field) return null;

    const uiType = field.ui_type;

    if (uiType === 'Checkbox') {
      return (
        <Select
          value={rule.value === true || rule.value === 'true' ? 'true' : 'false'}
          onValueChange={(v) => updateRule(rule.id, { value: v === 'true' })}
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
          value={String(rule.value ?? '')}
          onValueChange={(v) => updateRule(rule.id, { value: v })}
        >
          <SelectTrigger className="h-7 text-xs w-[100px]">
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
        value={String(rule.value ?? '')}
        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
        placeholder="Value"
        className="h-7 text-xs w-[100px]"
      />
    );
  }

  const activeCount = rules.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#6A7184] gap-1">
          <Palette size={14} />
          Color
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[#3366FF] text-white text-[10px] font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] max-h-[400px] overflow-y-auto p-3 shadow-lg" align="start">
        <div className="space-y-2">
          {rules.map((rule) => {
            const Icon = getFieldTypeIcon(fieldMap.get(rule.field_id)?.ui_type ?? 'SingleLineText');
            const operators = getOperators(rule.field_id);

            return (
              <div key={rule.id} className="flex items-center gap-1.5">
                {/* Color picker */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.name}
                      className="w-5 h-5 rounded-full border-2 transition-colors"
                      style={{
                        backgroundColor: c.value,
                        borderColor: rule.color === c.value ? '#6A7184' : 'transparent',
                      }}
                      onClick={() => updateRule(rule.id, { color: c.value })}
                    />
                  ))}
                </div>

                {/* Field */}
                <Select
                  value={rule.field_id}
                  onValueChange={(v) => {
                    const newOps = getOperators(v);
                    updateRule(rule.id, {
                      field_id: v,
                      operator: newOps[0],
                      value: '',
                    });
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => {
                      const FIcon = getFieldTypeIcon(f.ui_type);
                      return (
                        <SelectItem key={f.id} value={f.id}>
                          <span className="flex items-center gap-1.5">
                            <FIcon size={12} className="text-[#9AA2AF]" />
                            {f.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={rule.operator}
                  onValueChange={(v) =>
                    updateRule(rule.id, {
                      operator: v as FilterOperator,
                      value: NO_VALUE_OPS.includes(v as FilterOperator) ? '' : rule.value,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-[100px]">
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
                {renderValueInput(rule)}

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[#9AA2AF] hover:text-red-500 shrink-0"
                  onClick={() => removeRule(rule.id)}
                >
                  <X size={14} />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#E7E7E9]">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#3366FF] gap-1 font-medium"
            onClick={addRule}
          >
            <Plus size={14} /> Add rule
          </Button>
          {rules.length > 0 && (
            <button
              className="text-xs text-[#9AA2AF] hover:text-[#6A7184] transition-colors"
              onClick={() => onRulesChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
