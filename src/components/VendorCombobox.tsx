import { useEffect, useState } from 'react';
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
import { supabase } from '@/lib/supabase';

interface Vendor {
  id: string;
  name: string;
  category: string;
}

interface VendorComboboxProps {
  value: string;
  onChange: (vendorName: string, vendorId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function VendorCombobox({
  value,
  onChange,
  disabled,
  placeholder = 'Select vendor…',
}: VendorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    supabase
      .from('vendors')
      .select('id, name, category')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        if (data) setVendors(data);
      });
  }, []);

  const selected = vendors.find((v) => v.name === value);

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
          <span className="truncate">{selected ? selected.name : value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] overflow-hidden"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search vendors…" className="h-9" />
          <CommandList
            className="max-h-60 overflow-y-scroll"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>No vendor found.</CommandEmpty>
            <CommandGroup>
              {vendors.map((v) => (
                <CommandItem
                  key={v.id}
                  value={v.name}
                  onSelect={() => {
                    onChange(v.name, v.id);
                    setOpen(false);
                  }}
                  className="text-xs py-1.5"
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5 shrink-0',
                      value === v.name ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{v.name}</span>
                  <span className="ml-auto text-muted-foreground capitalize text-[10px]">
                    {v.category}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
