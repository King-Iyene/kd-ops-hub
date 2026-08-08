import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { RecurrenceRule, RecurrenceFreq } from '@/lib/task-types';

interface RecurrenceEditorProps {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  const [open, setOpen] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFreq>(value?.freq || 'weekly');
  const [interval, setInterval] = useState(value?.interval || 1);
  const [weekdays, setWeekdays] = useState<number[]>(value?.weekdays || [1, 2, 3, 4, 5]);
  const [monthDay, setMonthDay] = useState(value?.monthDay || 1);
  const [endDate, setEndDate] = useState(value?.endDate || '');

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  };

  const apply = () => {
    const rule: RecurrenceRule = { freq, interval };
    if (freq === 'weekly' && weekdays.length > 0) rule.weekdays = weekdays;
    if (freq === 'monthly') rule.monthDay = monthDay;
    if (endDate) rule.endDate = endDate;
    onChange(rule);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  const label = value
    ? `Every ${value.interval > 1 ? `${value.interval} ` : ''}${value.freq === 'daily' ? 'day' : value.freq === 'weekly' ? 'week' : value.freq === 'monthly' ? 'month' : 'year'}${value.interval > 1 ? 's' : ''}`
    : 'Set recurrence';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 text-[11px] gap-1', value && 'text-primary')}
        >
          <Repeat className="h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3 space-y-3" align="start">
        <p className="text-xs font-semibold">Recurrence</p>

        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">Every</Label>
          <Input
            type="number"
            min={1}
            max={365}
            className="h-7 w-14 text-xs"
            value={interval}
            onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <Select value={freq} onValueChange={(v) => setFreq(v as RecurrenceFreq)}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Day(s)</SelectItem>
              <SelectItem value="weekly">Week(s)</SelectItem>
              <SelectItem value="monthly">Month(s)</SelectItem>
              <SelectItem value="yearly">Year(s)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {freq === 'weekly' && (
          <div className="space-y-1">
            <Label className="text-xs">On days</Label>
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((l, i) => (
                <button
                  key={i}
                  onClick={() => toggleWeekday(i)}
                  className={cn(
                    'h-7 w-7 rounded-full text-[10px] font-semibold transition-colors',
                    weekdays.includes(i)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {freq === 'monthly' && (
          <div className="space-y-1">
            <Label className="text-xs">On day</Label>
            <Input
              type="number"
              min={1}
              max={31}
              className="h-7 w-16 text-xs"
              value={monthDay}
              onChange={(e) => setMonthDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">End date <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            type="date"
            className="h-7 text-xs"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-7 text-xs" onClick={apply}>Apply</Button>
          {value && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clear}>Remove</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
