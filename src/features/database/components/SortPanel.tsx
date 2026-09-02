import { useMemo } from 'react';
import { ArrowUpDown, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { FieldMeta, Sort } from '@/features/database/types';
import { getFieldTypeIcon } from './grid/field-icons';

interface SortPanelProps {
  fields: FieldMeta[];
  sorts: Sort[];
  onSortsChange: (sorts: Sort[]) => void;
}

function getDirectionLabels(uiType: string): { asc: string; desc: string } {
  switch (uiType) {
    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent':
    case 'Duration':
    case 'Rating':
    case 'AutoNumber':
      return { asc: '1 → 9', desc: '9 → 1' };
    case 'Date':
    case 'DateTime':
    case 'CreatedTime':
    case 'LastModifiedTime':
    case 'Year':
    case 'Time':
      return { asc: 'Oldest first', desc: 'Newest first' };
    case 'Checkbox':
      return { asc: 'Unchecked first', desc: 'Checked first' };
    default:
      return { asc: 'A → Z', desc: 'Z → A' };
  }
}

export function SortPanel({ fields, sorts, onSortsChange }: SortPanelProps) {
  const availableFields = useMemo(
    () => fields.filter((f) => !f.is_system && !f.is_hidden),
    [fields],
  );

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    fields.forEach((f) => m.set(f.id, f));
    return m;
  }, [fields]);

  function addSort() {
    if (availableFields.length === 0) return;
    const usedIds = new Set(sorts.map((s) => s.field_id));
    const next = availableFields.find((f) => !usedIds.has(f.id)) ?? availableFields[0];
    onSortsChange([...sorts, { field_id: next.id, direction: 'asc' }]);
  }

  function updateSort(idx: number, patch: Partial<Sort>) {
    onSortsChange(sorts.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeSort(idx: number) {
    onSortsChange(sorts.filter((_, i) => i !== idx));
  }

  const activeCount = sorts.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#475569] gap-1">
          <ArrowUpDown size={14} />
          Sort
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[#006994] text-white text-[10px] font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3 shadow-lg" align="start">
        <div className="space-y-2">
          {sorts.map((sort, idx) => {
            const field = fieldMap.get(sort.field_id);
            const labels = getDirectionLabels(field?.ui_type ?? 'SingleLineText');

            return (
              <div key={`${sort.field_id}-${idx}`} className="flex items-center gap-1.5">
                {/* Field */}
                <Select
                  value={sort.field_id}
                  onValueChange={(v) => updateSort(idx, { field_id: v })}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => {
                      const Icon = getFieldTypeIcon(f.ui_type);
                      return (
                        <SelectItem key={f.id} value={f.id}>
                          <span className="flex items-center gap-1.5">
                            <Icon size={12} className="text-[#94A3B8]" />
                            {f.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Direction */}
                <Select
                  value={sort.direction}
                  onValueChange={(v) => updateSort(idx, { direction: v as 'asc' | 'desc' })}
                >
                  <SelectTrigger className="h-7 text-xs w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">{labels.asc}</SelectItem>
                    <SelectItem value="desc">{labels.desc}</SelectItem>
                  </SelectContent>
                </Select>

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[#94A3B8] hover:text-red-500 shrink-0"
                  onClick={() => removeSort(idx)}
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
            onClick={addSort}
          >
            <Plus size={14} /> Add sort
          </Button>
          {sorts.length > 0 && (
            <button
              className="text-xs text-[#94A3B8] hover:text-[#475569] transition-colors"
              onClick={() => onSortsChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
