import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useDatabaseUI } from '../lib/store';
import { useFields } from '../hooks';
import type { ConditionalFormatRule, ConditionalFormatOperator } from '../types';

const CF_OPERATOR_LABELS: Record<ConditionalFormatOperator, string> = {
  is: 'is',
  isNot: 'is not',
  contains: 'contains',
  doesNotContain: 'does not contain',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
};

const CF_OPERATORS: ConditionalFormatOperator[] = [
  'is', 'isNot', 'contains', 'doesNotContain', 'isEmpty', 'isNotEmpty',
  'gt', 'lt', 'gte', 'lte',
];

const CF_COLOR_PALETTE = [
  { name: 'Light Red', color: '#FEE2E2' },
  { name: 'Light Orange', color: '#FFEDD5' },
  { name: 'Light Yellow', color: '#FEF9C3' },
  { name: 'Light Green', color: '#DCFCE7' },
  { name: 'Light Cyan', color: '#CFFAFE' },
  { name: 'Light Blue', color: '#DBEAFE' },
  { name: 'Light Purple', color: '#F3E8FF' },
  { name: 'Light Pink', color: '#FCE7F3' },
];

interface ConditionalFormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConditionalFormatDialog({ open, onOpenChange }: ConditionalFormatDialogProps) {
  const { conditionalFormats, setConditionalFormats, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);

  const availableFields = useMemo(
    () => (fields ?? []).filter((f) => !f.is_system && f.ui_type !== 'ID'),
    [fields],
  );

  if (!open) return null;

  const addRule = () => {
    if (availableFields.length === 0) return;
    const newRule: ConditionalFormatRule = {
      id: crypto.randomUUID(),
      field_id: availableFields[0].id,
      operator: 'is',
      value: '',
      color: CF_COLOR_PALETTE[0].color,
    };
    setConditionalFormats([...conditionalFormats, newRule]);
  };

  const updateRule = (id: string, updates: Partial<ConditionalFormatRule>) => {
    setConditionalFormats(
      conditionalFormats.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
  };

  const removeRule = (id: string) => {
    setConditionalFormats(conditionalFormats.filter((r) => r.id !== id));
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={() => onOpenChange(false)} />
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-xl w-[540px] max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
          <span className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
            Conditional Formatting
          </span>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <X size={16} className="text-[#9AA2AF]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {conditionalFormats.length === 0 && (
            <p className="text-xs text-[#9AA2AF] mb-3">
              No rules yet. Add a rule to highlight cells based on their values.
            </p>
          )}

          {conditionalFormats.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 mb-3 p-2 rounded border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] bg-[#FAFAFA] dark:bg-[hsl(200,30%,12%)]"
            >
              <div className="flex flex-col gap-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <select
                    className="text-[11px] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,14%)] flex-1 max-w-[140px]"
                    value={rule.field_id}
                    onChange={(e) => updateRule(rule.id, { field_id: e.target.value })}
                  >
                    {availableFields.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <select
                    className="text-[11px] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,14%)]"
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.id, { operator: e.target.value as ConditionalFormatOperator })}
                  >
                    {CF_OPERATORS.map((op) => (
                      <option key={op} value={op}>{CF_OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                  {rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' && (
                    <input
                      className="text-[11px] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded px-1.5 py-1 text-[#374151] dark:text-[hsl(200,25%,88%)] dark:bg-[hsl(200,30%,14%)] flex-1 max-w-[100px]"
                      value={rule.value ?? ''}
                      onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                      placeholder="Value"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {CF_COLOR_PALETTE.map((p) => (
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
              </div>
              <button
                onClick={() => removeRule(rule.id)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 self-start"
              >
                <X size={14} className="text-[#9AA2AF]" />
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] flex items-center justify-between">
          <button
            className="text-[12px] text-[#3366FF] hover:underline font-medium"
            onClick={addRule}
          >
            + Add rule
          </button>
          <button
            className="px-3 py-1.5 text-[12px] bg-[#3366FF] text-white rounded hover:bg-[#2952CC] font-medium"
            onClick={() => onOpenChange(false)}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
