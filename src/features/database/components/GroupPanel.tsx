import { useMemo } from 'react';
import { Group as GroupIcon, Plus, X } from 'lucide-react';
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
import type { FieldMeta, Group } from '@/features/database/types';
import { getFieldTypeIcon } from './grid/field-icons';

interface GroupPanelProps {
  fields: FieldMeta[];
  groups: Group[];
  onGroupsChange: (groups: Group[]) => void;
}

export function GroupPanel({ fields, groups, onGroupsChange }: GroupPanelProps) {
  const availableFields = useMemo(
    () => fields.filter((f) => !f.is_system && !f.is_hidden),
    [fields],
  );

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    fields.forEach((f) => m.set(f.id, f));
    return m;
  }, [fields]);

  function addGroup() {
    if (availableFields.length === 0) return;
    const usedIds = new Set(groups.map((g) => g.field_id));
    const next = availableFields.find((f) => !usedIds.has(f.id)) ?? availableFields[0];
    onGroupsChange([...groups, { field_id: next.id, direction: 'asc' }]);
  }

  function updateGroup(idx: number, patch: Partial<Group>) {
    onGroupsChange(groups.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }

  function removeGroup(idx: number) {
    onGroupsChange(groups.filter((_, i) => i !== idx));
  }

  const activeCount = groups.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#6A7184] gap-1">
          <GroupIcon size={14} />
          Group
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[#3366FF] text-white text-[10px] font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3 shadow-lg" align="start">
        <div className="space-y-2">
          {groups.map((group, idx) => {
            const field = fieldMap.get(group.field_id);

            return (
              <div key={`${group.field_id}-${idx}`} className="flex items-center gap-1.5">
                <Select
                  value={group.field_id}
                  onValueChange={(v) => updateGroup(idx, { field_id: v })}
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
                            <Icon size={12} className="text-[#9AA2AF]" />
                            {f.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <Select
                  value={group.direction}
                  onValueChange={(v) => updateGroup(idx, { direction: v as 'asc' | 'desc' })}
                >
                  <SelectTrigger className="h-7 text-xs w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[#9AA2AF] hover:text-red-500 shrink-0"
                  onClick={() => removeGroup(idx)}
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
            onClick={addGroup}
          >
            <Plus size={14} /> Add group
          </Button>
          {groups.length > 0 && (
            <button
              className="text-xs text-[#9AA2AF] hover:text-[#6A7184] transition-colors"
              onClick={() => onGroupsChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
