import { useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { FieldMeta } from '@/features/database/types';
import { getFieldTypeIcon } from './grid/field-icons';

interface FieldVisibilityPanelProps {
  fields: FieldMeta[];
  hiddenFieldIds: Set<string>;
  onToggleField: (fieldId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

export function FieldVisibilityPanel({
  fields,
  hiddenFieldIds,
  onToggleField,
  onShowAll,
  onHideAll,
}: FieldVisibilityPanelProps) {
  const nonSystemFields = useMemo(
    () => fields.filter((f) => !f.is_system),
    [fields],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)] gap-1">
          <EyeOff size={14} /> Hide Fields
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3 shadow-lg" align="start">
        <div className="flex items-center justify-between mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-[#166EE1] font-medium"
            onClick={onShowAll}
          >
            Show All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-[#166EE1] font-medium"
            onClick={onHideAll}
          >
            Hide All
          </Button>
        </div>
        <div className="space-y-1 max-h-[320px] overflow-y-auto">
          {nonSystemFields.map((field) => {
            const Icon = getFieldTypeIcon(field.ui_type);
            const visible = !hiddenFieldIds.has(field.id);
            return (
              <div
                key={field.id}
                className="flex items-center justify-between py-1 px-1 rounded hover:bg-[#F1F5F9] dark:hover:bg-[hsl(200,25%,14%)]"
              >
                <span className="flex items-center gap-2 text-xs text-[#374151] dark:text-[hsl(200,25%,88%)]">
                  <Icon size={14} className="text-[#9AA2AF]" />
                  {field.name}
                </span>
                <Switch
                  checked={visible}
                  onCheckedChange={() => onToggleField(field.id)}
                  className="scale-75"
                />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
