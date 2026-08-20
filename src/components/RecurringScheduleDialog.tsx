import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface RecurringScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  batchName?: string;
  paymentDate?: string | null;
  profile: { id: string } | null;
}

export function RecurringScheduleDialog({
  open, onOpenChange, batchId, batchName, paymentDate, profile,
}: RecurringScheduleDialogProps) {
  const { toast } = useToast();
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [recurFrequency, setRecurFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'custom'>('monthly');
  const [recurDay, setRecurDay] = useState<number>(1);
  const [recurCustomDays, setRecurCustomDays] = useState(30);

  const handleCreate = async () => {
    setSavingSchedule(true);
    const today = new Date();
    let nextDate: Date;
    if (recurFrequency === 'weekly') {
      nextDate = new Date(today);
      nextDate.setDate(today.getDate() + ((recurDay - today.getDay() + 7) % 7 || 7));
    } else if (recurFrequency === 'biweekly') {
      nextDate = new Date(today);
      nextDate.setDate(today.getDate() + 14);
    } else if (recurFrequency === 'monthly') {
      nextDate = new Date(today.getFullYear(), today.getMonth() + 1, recurDay || 1);
    } else {
      nextDate = new Date(today);
      nextDate.setDate(today.getDate() + recurCustomDays);
    }
    const { error } = await supabase.from('recurring_schedules').insert({
      source_batch_id: batchId,
      frequency: recurFrequency,
      day_of_week: recurFrequency === 'weekly' ? recurDay : null,
      day_of_month: recurFrequency === 'monthly' ? recurDay : null,
      custom_interval_days: recurFrequency === 'custom' ? recurCustomDays : null,
      next_run_date: nextDate.toISOString().slice(0, 10),
      created_by: profile?.id,
    });
    if (error) {
      toast({ title: 'Could not create schedule', description: error.message, variant: 'destructive' });
      setSavingSchedule(false);
      return;
    }
    await logAudit(
      'batch_scheduled',
      `Batch "${batchName}" set to recur ${recurFrequency}`,
      profile,
    );
    toast({
      title: 'Recurring schedule created',
      description: `Next run: ${nextDate.toLocaleDateString('en-GB')}`,
    });
    onOpenChange(false);
    setSavingSchedule(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make this batch recurring</DialogTitle>
          <DialogDescription>
            Schedule this batch to repeat automatically on the chosen cadence.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select
              value={recurFrequency}
              onValueChange={(v) => setRecurFrequency(v as any)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom interval</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {recurFrequency === 'weekly' && (
            <div className="space-y-1">
              <Label>Day of week</Label>
              <Select
                value={String(recurDay)}
                onValueChange={(v) => setRecurDay(Number(v))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {recurFrequency === 'monthly' && (
            <div className="space-y-1">
              <Label>Day of month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={recurDay || new Date(paymentDate || '').getDate() || 1}
                onChange={(e) => setRecurDay(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
              />
            </div>
          )}
          {recurFrequency === 'custom' && (
            <div className="space-y-1">
              <Label>Every N days</Label>
              <Input
                type="number"
                min={1}
                value={recurCustomDays}
                onChange={(e) => setRecurCustomDays(Number(e.target.value) || 7)}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            KDOps will auto-create a new draft batch on schedule and submit it
            for approval. You can cancel the schedule at any time.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={savingSchedule} onClick={handleCreate}>
            Create schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
