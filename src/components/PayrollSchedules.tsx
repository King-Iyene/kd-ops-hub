import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  ChevronRight,
  Info,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Calendar,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PayFrequency = 'monthly' | 'biweekly' | 'weekly' | 'semimonthly';
export type DayAdjustment = 'before' | 'after' | 'none';

export interface PaySchedule {
  id: string;
  name: string;
  frequency: PayFrequency;
  anchor_day: number;
  second_anchor_day: number | null;
  day_adjustment: DayAdjustment;
  processing_lead_days: number;
  cutoff_lead_days: number;
  auto_approve: boolean;
  notify_roles: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type FormState = Omit<PaySchedule, 'id' | 'created_at' | 'updated_at'>;

const EMPTY_FORM: FormState = {
  name: '',
  frequency: 'monthly',
  anchor_day: 25,
  second_anchor_day: null,
  day_adjustment: 'before',
  processing_lead_days: 5,
  cutoff_lead_days: 2,
  auto_approve: false,
  notify_roles: ['finance', 'admin', 'super_admin'],
  is_active: true,
};

// ─── Date helpers (client-side preview) ──────────────────────────────────────

function adjustForWeekend(d: Date, adj: DayAdjustment): Date {
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (adj === 'none') return d;
  if (dow === 6) {
    return new Date(d.getTime() + (adj === 'after' ? 2 : -1) * 86_400_000);
  }
  if (dow === 0) {
    return new Date(d.getTime() + (adj === 'after' ? 1 : -2) * 86_400_000);
  }
  return d;
}

export function computeNextPayDates(schedule: PaySchedule | FormState, count = 6): Date[] {
  const { frequency, anchor_day, second_anchor_day, day_adjustment } = schedule;
  const results: Date[] = [];
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let iters = 0;

  while (results.length < count && iters < 500) {
    iters++;
    let candidate: Date;

    if (frequency === 'monthly') {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const lastDay = new Date(y, m + 1, 0).getDate();
      const day = anchor_day === 99 ? lastDay : Math.min(anchor_day, lastDay);
      candidate = new Date(y, m, day);
      if (candidate <= cursor) {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        continue;
      }
    } else if (frequency === 'semimonthly') {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const d1 = new Date(y, m, anchor_day);
      const d2 = new Date(y, m, second_anchor_day ?? 15);
      const upcoming = [d1, d2].filter((d) => d > cursor).sort((a, b) => a.getTime() - b.getTime());
      if (upcoming.length === 0) {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        continue;
      }
      candidate = upcoming[0];
    } else if (frequency === 'biweekly') {
      // ISO weekday 1=Mon…7=Sun; anchor_day stores 1–5
      const isoAnchor = anchor_day;
      const isoToday = cursor.getDay() === 0 ? 7 : cursor.getDay();
      let daysAhead = (isoAnchor - isoToday + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      candidate = new Date(cursor.getTime() + daysAhead * 86_400_000);
      cursor = new Date(candidate.getTime() + 13 * 86_400_000);
    } else {
      // weekly
      const isoAnchor = anchor_day;
      const isoToday = cursor.getDay() === 0 ? 7 : cursor.getDay();
      let daysAhead = (isoAnchor - isoToday + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      candidate = new Date(cursor.getTime() + daysAhead * 86_400_000);
      cursor = candidate;
    }

    const adjusted = adjustForWeekend(new Date(candidate), day_adjustment);
    results.push(adjusted);

    if (frequency === 'monthly' || frequency === 'semimonthly') {
      cursor = new Date(adjusted.getTime() + 86_400_000);
    }
  }

  return results;
}

// ─── Label helpers ────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<PayFrequency, string> = {
  monthly: 'Monthly',
  biweekly: 'Bi-weekly',
  weekly: 'Weekly',
  semimonthly: 'Semi-monthly',
};

const DAY_LABELS: Record<DayAdjustment, string> = {
  before: 'Previous business day',
  after: 'Next business day',
  none: 'Pay on that day',
};

const WEEKDAY_LABELS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function anchorLabel(s: PaySchedule | FormState): string {
  if (s.frequency === 'weekly' || s.frequency === 'biweekly') {
    return WEEKDAY_LABELS[s.anchor_day] ?? `Day ${s.anchor_day}`;
  }
  if (s.frequency === 'semimonthly') {
    return `${ordinal(s.anchor_day)} & ${ordinal(s.second_anchor_day ?? 15)}`;
  }
  return s.anchor_day === 99 ? 'Last working day' : `${ordinal(s.anchor_day)} of month`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function daysUntil(d: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NextPayDatePill({ date, label }: { date: Date; label?: string }) {
  const days = daysUntil(date);
  const urgent = days <= 3;
  const soon = days <= 7;
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium w-fit',
      urgent ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : soon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    )}>
      <CalendarClock className="h-3 w-3 shrink-0" />
      <span>{label ?? formatDate(date)}</span>
      <span className="opacity-70">
        ({days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`})
      </span>
    </div>
  );
}

function UpcomingTimeline({ schedule }: { schedule: PaySchedule }) {
  const dates = computeNextPayDates(schedule, 6);
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {dates.map((d, i) => (
        <NextPayDatePill key={i} date={d} />
      ))}
    </div>
  );
}

// ─── PayScheduleForm ─────────────────────────────────────────────────────────

function PayScheduleForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const previewDates = computeNextPayDates(form, 3);
  const needsSecondAnchor = form.frequency === 'semimonthly';
  const isWeekBased = form.frequency === 'biweekly' || form.frequency === 'weekly';

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="ps-name">Schedule name</Label>
        <Input
          id="ps-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Monthly Staff Payroll"
        />
      </div>

      {/* Frequency */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Pay frequency</Label>
          <Select
            value={form.frequency}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                frequency: v as PayFrequency,
                anchor_day: v === 'weekly' || v === 'biweekly' ? 5 : 25,
                second_anchor_day: v === 'semimonthly' ? 15 : null,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="semimonthly">Semi-monthly (2× / month)</SelectItem>
              <SelectItem value="biweekly">Bi-weekly (every 2 weeks)</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Anchor day */}
        <div className="space-y-1.5">
          <Label>{isWeekBased ? 'Pay day (weekday)' : 'Pay day (of month)'}</Label>
          {isWeekBased ? (
            <Select
              value={String(form.anchor_day)}
              onValueChange={(v) => setForm((f) => ({ ...f, anchor_day: Number(v) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.slice(1).map((d, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={String(form.anchor_day)}
              onValueChange={(v) => setForm((f) => ({ ...f, anchor_day: Number(v) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>{ordinal(d)} of month</SelectItem>
                ))}
                <SelectItem value="99">Last working day</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Second anchor for semi-monthly */}
      {needsSecondAnchor && (
        <div className="space-y-1.5">
          <Label>Second pay day (of month)</Label>
          <Select
            value={String(form.second_anchor_day ?? 15)}
            onValueChange={(v) => setForm((f) => ({ ...f, second_anchor_day: Number(v) }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }, (_, i) => i + 1)
                .filter((d) => d !== form.anchor_day)
                .map((d) => (
                  <SelectItem key={d} value={String(d)}>{ordinal(d)} of month</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Weekend adjustment */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          Weekend / holiday adjustment
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              If the pay date falls on a weekend or public holiday, move it to the previous or next business day.
            </TooltipContent>
          </Tooltip>
        </Label>
        <Select
          value={form.day_adjustment}
          onValueChange={(v) => setForm((f) => ({ ...f, day_adjustment: v as DayAdjustment }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="before">Previous business day (recommended)</SelectItem>
            <SelectItem value="after">Next business day</SelectItem>
            <SelectItem value="none">Pay on that day regardless</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Processing and cutoff lead times */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Auto-draft (days before pay date)
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                The system will auto-generate a draft payroll run this many days before the pay date, so Finance has time to review.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={form.processing_lead_days}
            onChange={(e) =>
              setForm((f) => ({ ...f, processing_lead_days: Math.max(1, Number(e.target.value)) }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Data cutoff (days before pay date)
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                After the cutoff date, no further salary or deduction changes can be applied to this payroll run.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            type="number"
            min={0}
            max={20}
            value={form.cutoff_lead_days}
            onChange={(e) =>
              setForm((f) => ({ ...f, cutoff_lead_days: Math.max(0, Number(e.target.value)) }))
            }
          />
        </div>
      </div>

      {/* Auto-approve toggle */}
      <div className="flex items-start gap-3 rounded-lg border border-border/60 px-4 py-3 bg-muted/30">
        <div className="flex-1">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-500" />
            Auto-approve drafts
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            If enabled, auto-generated drafts are immediately approved — no manual review required.
            Use only when you trust the data is always correct.
          </p>
        </div>
        <Switch
          checked={form.auto_approve}
          onCheckedChange={(v) => setForm((f) => ({ ...f, auto_approve: v }))}
        />
      </div>

      {/* Live preview */}
      {form.name && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming pay dates preview
          </p>
          <div className="flex flex-wrap gap-2">
            {previewDates.map((d, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
              >
                <Calendar className="h-3 w-3" />
                {formatDate(d)}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Processing window opens <strong>{form.processing_lead_days}d</strong> before each pay date.
            Data cutoff: <strong>{form.cutoff_lead_days}d</strong> before.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── PayrollSchedules (main export) ─────────────────────────────────────────

export function PayrollSchedules() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<PaySchedule[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaySchedule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaySchedule | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pay_schedules')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setSchedules((data as PaySchedule[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: PaySchedule) => {
    setEditing(s);
    setForm({
      name: s.name,
      frequency: s.frequency,
      anchor_day: s.anchor_day,
      second_anchor_day: s.second_anchor_day,
      day_adjustment: s.day_adjustment,
      processing_lead_days: s.processing_lead_days,
      cutoff_lead_days: s.cutoff_lead_days,
      auto_approve: s.auto_approve,
      notify_roles: s.notify_roles,
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Schedule name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        created_by: profile?.id,
      };

      if (editing) {
        const { error } = await supabase
          .from('pay_schedules')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Schedule updated' });
      } else {
        const { error } = await supabase
          .from('pay_schedules')
          .insert(payload);
        if (error) throw error;
        toast({ title: 'Schedule created' });
      }

      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Failed to save schedule', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: PaySchedule) => {
    const { error } = await supabase
      .from('pay_schedules')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);
    if (error) {
      toast({ title: 'Failed to update schedule', variant: 'destructive' });
    } else {
      setSchedules((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('pay_schedules')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Cannot delete schedule', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Schedule deleted' });
      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Pay Schedules</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define recurring payroll cadences. The system auto-drafts runs when the processing window opens.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" /> New schedule
        </Button>
      </div>

      {/* How it works callout */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex gap-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <div className="space-y-1">
          <p className="font-medium">How auto-scheduling works</p>
          <ol className="list-decimal pl-4 space-y-0.5 text-xs leading-relaxed">
            <li>You define a pay schedule (frequency, pay day, lead times).</li>
            <li>The scheduler runs daily at 06:00 UTC and opens a processing window N days before each pay date.</li>
            <li>A draft payroll run is auto-created. Finance receives an in-app notification.</li>
            <li>Finance reviews, adds bonuses/allowances, submits for approval, then disburses.</li>
            <li>After the cutoff date, no further changes can be applied to the run's data.</li>
          </ol>
        </div>
      </div>

      {/* Schedules table */}
      {loading ? (
        <TableSkeleton rows={3} cols={5} />
      ) : schedules.length === 0 ? (
        <EmptyState
          illustration="coin"
          title="No pay schedules yet"
          description="Create your first pay schedule and let KDOps auto-draft payroll runs on time, every time."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New schedule
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Pay day</TableHead>
                  <TableHead>Next pay date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => {
                  const nextDates = computeNextPayDates(s, 3);
                  const next = nextDates[0];
                  const isExpanded = expanded === s.id;
                  return (
                    <>
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setExpanded(isExpanded ? null : s.id)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                                isExpanded && 'rotate-90',
                              )}
                            />
                            {s.name}
                            {s.auto_approve && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>Auto-approve enabled</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{FREQ_LABELS[s.frequency]}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {anchorLabel(s)}
                        </TableCell>
                        <TableCell>
                          {next ? <NextPayDatePill date={next} /> : '—'}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(s); }}
                            className="flex items-center gap-1.5 text-xs font-medium"
                          >
                            {s.is_active ? (
                              <>
                                <ToggleRight className="h-4 w-4 text-green-500" />
                                <span className="text-green-600 dark:text-green-400">Active</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Paused</span>
                              </>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(s)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row: upcoming timeline + settings summary */}
                      {isExpanded && (
                        <TableRow key={`${s.id}-expanded`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={6} className="py-4 px-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Timeline */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                  Next 6 pay dates
                                </p>
                                <div className="space-y-2">
                                  {computeNextPayDates(s, 6).map((d, i) => {
                                    const days = daysUntil(d);
                                    const cutoffDate = new Date(d.getTime() - s.cutoff_lead_days * 86_400_000);
                                    const draftDate = new Date(d.getTime() - s.processing_lead_days * 86_400_000);
                                    return (
                                      <div key={i} className="flex items-start gap-3">
                                        <div className={cn(
                                          'flex-none w-2 h-2 rounded-full mt-1.5',
                                          i === 0 ? 'bg-primary' : 'bg-muted-foreground/40',
                                        )} />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium">{formatDate(d)}</span>
                                            <span className={cn(
                                              'text-xs px-1.5 py-0.5 rounded-full font-medium',
                                              days <= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : days <= 7 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                  : 'bg-muted text-muted-foreground',
                                            )}>
                                              {days === 0 ? 'today' : days < 0 ? 'passed' : `in ${days}d`}
                                            </span>
                                          </div>
                                          <p className="text-xs text-muted-foreground mt-0.5">
                                            Draft opens: {formatDate(draftDate)} · Cutoff: {formatDate(cutoffDate)}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Settings summary */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                  Configuration
                                </p>
                                <dl className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Weekend adjustment</dt>
                                    <dd className="font-medium">{DAY_LABELS[s.day_adjustment]}</dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Processing opens</dt>
                                    <dd className="font-medium">{s.processing_lead_days} days before pay date</dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Data cutoff</dt>
                                    <dd className="font-medium">{s.cutoff_lead_days} days before pay date</dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Auto-approve drafts</dt>
                                    <dd className={cn('font-medium', s.auto_approve ? 'text-amber-600' : 'text-muted-foreground')}>
                                      {s.auto_approve ? 'Yes — drafts are auto-approved' : 'No — manual approval required'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Notify</dt>
                                    <dd className="font-medium">{s.notify_roles.join(', ')}</dd>
                                  </div>
                                </dl>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Create / Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit pay schedule' : 'New pay schedule'}</DialogTitle>
          </DialogHeader>
          <PayScheduleForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete pay schedule?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">{deleteTarget?.name}</strong> will be permanently
            deleted. Existing payroll runs linked to this schedule will not be affected, but the
            system will no longer auto-draft runs for this schedule.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── NextPayrollBanner (used in Payroll page header) ───────────────────────────
// Shows a countdown strip when there's an active schedule with an upcoming run.

export function NextPayrollBanner() {
  const [next, setNext] = useState<{ date: Date; scheduleName: string; draftDate: Date } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pay_schedules')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (!data?.length) return;

      let earliest: { date: Date; scheduleName: string; draftDate: Date } | null = null;
      for (const s of data as PaySchedule[]) {
        const dates = computeNextPayDates(s, 1);
        if (!dates[0]) continue;
        const d = dates[0];
        const draft = new Date(d.getTime() - s.processing_lead_days * 86_400_000);
        if (!earliest || d < earliest.date) {
          earliest = { date: d, scheduleName: s.name, draftDate: draft };
        }
      }
      setNext(earliest);
    })();
  }, []);

  if (!next) return null;

  const days = daysUntil(next.date);
  const draftDays = daysUntil(next.draftDate);
  const urgent = days <= 5;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
      urgent
        ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
        : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 text-green-800 dark:text-green-200',
    )}>
      <CalendarClock className={cn('h-4 w-4 shrink-0', urgent ? 'text-amber-500' : 'text-green-500')} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{next.scheduleName}</span>
        {' · '}
        Next pay date: <strong>{formatDate(next.date)}</strong>
        {' '}
        ({days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`})
        {draftDays <= 0 ? (
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium">
            Processing window open
          </span>
        ) : (
          <span className="ml-2 text-xs opacity-70">
            Draft auto-generates {draftDays === 1 ? 'tomorrow' : `in ${draftDays}d`}
          </span>
        )}
      </div>
      {urgent && <Clock className="h-4 w-4 shrink-0 text-amber-500" />}
    </div>
  );
}
