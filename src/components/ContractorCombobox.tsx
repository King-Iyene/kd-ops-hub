import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ContractorOption { id: string; full_name: string }

/** Searchable single-select for contractors (type to filter). */
export function ContractorCombobox({
  value,
  onChange,
  contractors,
  placeholder = 'Select contractor…',
  clearLabel,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  contractors: ContractorOption[];
  placeholder?: string;
  /** When set, shows a top item that clears the selection (e.g. "— none —"). */
  clearLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = contractors.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal truncate"
        >
          <span className="truncate">{selected ? selected.full_name : (clearLabel ?? placeholder)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] overflow-hidden"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search contractor…" className="h-9" />
          <CommandList className="max-h-60 overflow-y-scroll" onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>No contractor found.</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(''); setOpen(false); }}
                  className="text-xs py-1.5 text-muted-foreground"
                >
                  <Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', value === '' ? 'opacity-100' : 'opacity-0')} />
                  {clearLabel}
                </CommandItem>
              )}
              {contractors.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.full_name}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                  className="text-sm py-1.5"
                >
                  <Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  {c.full_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
