import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ME_VALUE, type FilterFieldDef, type FilterOperator, type FilterValue, type RelativeDateKey } from './types';

const RELATIVE_LABELS: Record<RelativeDateKey, string> = {
  today: 'Today',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_30_days: 'The last 30 days',
};

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MultiOptionPicker({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const label = selected.length === 0 ? 'Choose...' : options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs justify-start min-w-[140px] font-normal">
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted text-left"
          >
            <span className={cn('h-3.5 w-3.5 rounded-sm border border-border flex items-center justify-center shrink-0', selected.includes(o.value) && 'bg-primary border-primary')}>
              {selected.includes(o.value) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </span>
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function DateValueInput({ value, onChange }: { value: FilterValue; onChange: (v: FilterValue) => void }) {
  const isRelative = value != null && !Array.isArray(value) && typeof value === 'object' && value.kind === 'relative';
  const mode = isRelative ? 'relative' : 'exact';

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={mode}
        onValueChange={(m) => onChange(m === 'relative' ? { kind: 'relative', key: 'today' } : null)}
      >
        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="exact">Exact date</SelectItem>
          <SelectItem value="relative">Relative</SelectItem>
        </SelectContent>
      </Select>

      {mode === 'relative' ? (
        <Select
          value={isRelative ? value.key : 'today'}
          onValueChange={(key: RelativeDateKey) => onChange({ kind: 'relative', key })}
        >
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RELATIVE_LABELS) as RelativeDateKey[]).map((k) => (
              <SelectItem key={k} value={k}>{RELATIVE_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs font-normal">
              {typeof value === 'string' ? value : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={typeof value === 'string' ? new Date(`${value}T00:00:00`) : undefined}
              onSelect={(d) => onChange(d ? toLocalDateString(d) : null)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function FilterValueInput({
  field,
  operator,
  value,
  onChange,
  statusOptions,
  peopleOptions,
}: {
  field: FilterFieldDef;
  operator: FilterOperator;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
  statusOptions: { value: string; label: string }[];
  peopleOptions: { value: string; label: string }[];
}) {
  if (operator === 'is_set' || operator === 'is_not_set') return null;

  if (field.type === 'text') {
    return (
      <Input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
        className="h-8 text-xs w-40"
      />
    );
  }

  if (field.type === 'date') {
    return <DateValueInput value={value} onChange={onChange} />;
  }

  if (field.type === 'select' || field.type === 'person') {
    const options = field.type === 'person' ? [{ value: ME_VALUE, label: 'Me' }, ...peopleOptions] : (field.options ?? statusOptions);
    const multi = operator === 'is_any_of' || operator === 'is_none_of';
    const selected = Array.isArray(value) ? value : value && typeof value === 'string' ? [value] : [];

    if (multi) {
      return <MultiOptionPicker options={options} selected={selected} onChange={onChange} />;
    }
    return (
      <Select value={selected[0] ?? undefined} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Choose..." /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return null;
}
