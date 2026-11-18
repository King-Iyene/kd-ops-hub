import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface ToolbarOption<T extends string> {
  value: T;
  label: string;
}

/** Section 8's shared `GroupMenu` / `SortMenu` pieces: a labelled dropdown
 *  of the form "Group: Status" that opens a list of choices. */
export function ToolbarMenu<T extends string>({
  prefix,
  value,
  options,
  onChange,
}: {
  prefix: string;
  value: T;
  options: ToolbarOption<T>[];
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-8 inline-flex items-center gap-1 rounded-md border border-border px-2.5 text-2xs font-medium text-muted-foreground hover:text-foreground kd-transition">
          {prefix}: {current?.label ?? value}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)} className="gap-2">
            {o.value === value && <Check className="h-3 w-3" />}
            <span className={o.value !== value ? 'pl-5' : ''}>{o.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
