import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TaskAvatar } from './TaskAvatar';
import type { TaskPerson } from '../api/people';

export function PeoplePicker({
  people,
  excludeIds,
  onSelect,
  label = 'Add person',
}: {
  people: TaskPerson[];
  excludeIds: string[];
  onSelect: (person: TaskPerson) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const available = people.filter((p) => !excludeIds.includes(p.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people..." />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {available.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.full_name}
                  onSelect={() => {
                    onSelect(p);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <TaskAvatar userId={p.id} name={p.full_name} photoUrl={p.photo_url} size={20} />
                  <span className="truncate">{p.full_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
