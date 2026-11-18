import { Filter as FilterIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FilterBuilder } from './FilterBuilder';
import type { FilterFieldDef, FilterTree } from './types';

export function FilterButton({
  tree,
  onChange,
  fields,
  statusOptions,
  peopleOptions,
}: {
  tree: FilterTree;
  onChange: (next: FilterTree) => void;
  fields: FilterFieldDef[];
  statusOptions: { value: string; label: string }[];
  peopleOptions: { value: string; label: string }[];
}) {
  const count = tree.reduce((n, node) => n + (node.kind === 'condition' ? 1 : node.conditions.length), 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'h-8 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 text-2xs font-medium kd-transition',
            count > 0 ? 'text-primary border-primary/40 bg-primary/5' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FilterIcon className="h-3.5 w-3.5" /> Filter{count > 0 ? ` (${count})` : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <FilterBuilder tree={tree} onChange={onChange} fields={fields} statusOptions={statusOptions} peopleOptions={peopleOptions} />
      </PopoverContent>
    </Popover>
  );
}
