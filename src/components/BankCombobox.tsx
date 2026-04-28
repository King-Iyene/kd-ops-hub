import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { NigerianBank } from '@/lib/nigerian-banks';

interface BankComboboxProps {
  /** Currently selected bank name (display name, not code). */
  value: string;
  /** Called with (name, code) when the user picks a bank. */
  onChange: (name: string, code: string) => void;
  banks: NigerianBank[];
  disabled?: boolean;
  placeholder?: string;
}

export function BankCombobox({
  value,
  onChange,
  banks,
  disabled,
  placeholder = 'Select bank…',
}: BankComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = banks.find((b) => b.name === value);

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
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandInput placeholder="Search bank…" className="h-9" />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>No bank found.</CommandEmpty>
            <CommandGroup>
              {banks.map((b) => (
                <CommandItem
                  key={b.code}
                  value={b.name}
                  onSelect={() => {
                    onChange(b.name, b.code);
                    setOpen(false);
                  }}
                  className="text-xs py-1.5"
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5 shrink-0',
                      value === b.name ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {b.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
