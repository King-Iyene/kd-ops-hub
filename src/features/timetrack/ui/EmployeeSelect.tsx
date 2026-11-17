import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

/** Searchable single-person picker with an "All employees" choice (value '' = everyone). */
export function EmployeeSelect({
  value, onChange, employees, className,
}: {
  value: string;
  onChange: (id: string) => void;
  employees: { id: string; full_name: string | null }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = employees.find((e) => e.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-64 justify-between font-normal', className)}>
          <span className="truncate">{current?.full_name ?? 'All employees'}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search employees…" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all employees" onSelect={() => { onChange(''); setOpen(false); }}>
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} /> All employees
              </CommandItem>
              {employees.map((e) => (
                <CommandItem key={e.id} value={e.full_name ?? e.id} onSelect={() => { onChange(e.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', value === e.id ? 'opacity-100' : 'opacity-0')} /> {e.full_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
