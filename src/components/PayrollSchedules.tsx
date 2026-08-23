import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Info,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Calendar,
  AlertTriangle,
  Zap,
  Users,
  CalendarDays,
  Sparkles,
  History,
  TrendingUp,
  TrendingDown,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useCompanySettings } from '@/queries/useCompanySettings';
import { formatDate, formatNaira } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PayFrequency = 'monthly' | 'biweekly' | 'weekly' | 'semimonthly' | 'bimonthly' | 'quarterly' | 'triannual' | 'biannual' | 'annual';
export type ScheduleKind = 'regular' | 'off_cycle';
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
  schedule_kind: ScheduleKind;
  linked_schedule_id: string | null;
  allowance_context: string | null;
}

interface PayGroup {
  id: string;
  name: string;
  description: string | null;
  pay_schedule_id: string | null;
  role_filter: string[];
  is_active: boolean;
  created_at: string;
}

interface PublicHoliday {
  id: string;
  country_code: string;
  holiday_date: string;
  name: string;
  is_observed: boolean;
}

// Row returned from the new tabular next_pay_dates RPC
interface NextPayDateRow {
  pay_date: string;
  draft_open_date: string;
  cutoff_date: string;
  adjusted_from: string | null;
  holiday_name: string | null;
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
  schedule_kind: 'regular' as ScheduleKind,
  linked_schedule_id: null,
  allowance_context: null,
};

// ─── Schedule presets — Nigeria-standard cadences ─────────────────────────────

interface SchedulePreset {
  key: string;
  label: string;
  description: string;
  config: Partial<FormState>;
}

const PRESETS: SchedulePreset[] = [
  {
    // Pay-on-the-5th is the most common Nigerian SME cadence —
    // workers get paid early in the new month for the previous
    // month's work, so cash-flow planning is straightforward.
    // Cutoff is the 25th of the *previous* month (5 day lead-in)
    // so HR has a week to lock overtime / variable pay before
    // payroll calc kicks off.
    key: 'ng-monthly-5',
    label: 'Monthly on the 5th (most common)',
    description: 'Salary on the 5th of every month for the previous month\'s work. Cutoff a few days before to lock overtime + variable pay. Rolls to the prior business day if the 5th lands on a weekend or holiday.',
    config: { frequency: 'monthly', anchor_day: 5, day_adjustment: 'before', processing_lead_days: 5, cutoff_lead_days: 3 },
  },
  {
    key: 'ng-monthly-25',
    label: 'Nigeria standard monthly (25th)',
    description: 'Salary on the 25th of every month, rolled to the prior business day if it falls on a weekend or public holiday.',
    config: { frequency: 'monthly', anchor_day: 25, day_adjustment: 'before', processing_lead_days: 5, cutoff_lead_days: 2 },
  },
  {
    key: 'ng-monthly-last',
    label: 'Last working day of month',
    description: 'Pay on the final working day each month — the most common pattern for senior salaries.',
    config: { frequency: 'monthly', anchor_day: 99, day_adjustment: 'before', processing_lead_days: 5, cutoff_lead_days: 2 },
  },
  {
    key: 'ng-semi-1-15',
    label: 'Semi-monthly (1st & 15th)',
    description: 'Two payouts per month — common for hourly contractors and progressive cash-flow management.',
    config: { frequency: 'semimonthly', anchor_day: 1, second_anchor_day: 15, day_adjustment: 'before', processing_lead_days: 3, cutoff_lead_days: 1 },
  },
  {
    key: 'ng-biweekly-fri',
    label: 'Bi-weekly (Friday)',
    description: 'Every two weeks on Friday — drivers, field staff and gig workers.',
    config: { frequency: 'biweekly', anchor_day: 5, day_adjustment: 'before', processing_lead_days: 2, cutoff_lead_days: 1 },
  },
  {
    key: 'ng-weekly-fri',
    label: 'Weekly (Friday)',
    description: 'Pay every Friday — short-cycle workforce.',
    config: { frequency: 'weekly', anchor_day: 5, day_adjustment: 'before', processing_lead_days: 1, cutoff_lead_days: 0 },
  },
  {
    key: 'ng-bimonthly-25',
    label: 'Bi-monthly (every 2 months)',
    description: 'Pay on the 25th every two months — common for contract retainers.',
    config: { frequency: 'bimonthly', anchor_day: 25, day_adjustment: 'before', processing_lead_days: 5, cutoff_lead_days: 2 },
  },
  {
    key: 'ng-quarterly-25',
    label: 'Quarterly',
    description: 'Pay on the 25th every three months — board fees, quarterly bonuses.',
    config: { frequency: 'quarterly', anchor_day: 25, day_adjustment: 'before', processing_lead_days: 7, cutoff_lead_days: 3 },
  },
  {
    key: 'ng-annual-dec',
    label: 'Annual (December — 13th month)',
    description: 'Once per year in December — 13th month salary, annual bonus.',
    config: { frequency: 'annual', anchor_day: 20, day_adjustment: 'before', processing_lead_days: 10, cutoff_lead_days: 5 },
  },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysUntil(d: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

const FREQ_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly',
  bimonthly: 'Bi-monthly',
  quarterly: 'Quarterly',
  triannual: 'Tri-annual',
  biannual: 'Bi-annual',
  annual: 'Annual',
};

const DAY_LABELS: Record<DayAdjustment, string> = {
  before: 'Previous business day',
  after: 'Next business day',
  none: 'Pay on that day',
};

const WEEKDAY_LABELS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function anchorLabel(s: PaySchedule | FormState): string {
  if (s.frequency === 'weekly' || s.frequency === 'biweekly') {
    return WEEKDAY_LABELS[s.anchor_day] ?? `Day ${s.anchor_day}`;
  }
  if (s.frequency === 'semimonthly') {
    return `${ordinal(s.anchor_day)} & ${ordinal(s.second_anchor_day ?? 15)}`;
  }
  return s.anchor_day === 99 ? 'Last working day' : `${ordinal(s.anchor_day)} of month`;
}

const MONTH_BASED_FREQUENCIES: PayFrequency[] = ['monthly', 'semimonthly', 'bimonthly', 'quarterly', 'triannual', 'biannual', 'annual'];

// ─── RPC helpers ──────────────────────────────────────────────────────────────

async function fetchNextDates(scheduleId: string, count = 6): Promise<NextPayDateRow[]> {
  const { data, error } = await supabase.rpc('next_pay_dates', {
    p_schedule_id: scheduleId,
    p_count: count,
  });
  if (error || !data) return [];
  return data as NextPayDateRow[];
}

// ─── NextPayDatePill ──────────────────────────────────────────────────────────

function NextPayDatePill({ row }: { row: NextPayDateRow }) {
  const date = new Date(row.pay_date);
  const days = daysUntil(date);
  const urgent = days <= 3;
  const soon = days <= 7;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium w-fit cursor-help',
          urgent ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : soon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        )}>
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span>{formatDate(date)}</span>
          <span className="opacity-70">
            ({days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`})
          </span>
          {row.holiday_name && <Sparkles className="h-3 w-3 text-amber-500" />}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          <p>Pay date: {formatDate(date)}</p>
          <p>Draft opens: {formatDate(new Date(row.draft_open_date))}</p>
          <p>Cutoff: {formatDate(new Date(row.cutoff_date))}</p>
          {row.adjusted_from && (
            <p className="text-amber-300">
              Adjusted from {formatDate(new Date(row.adjusted_from))}
              {row.holiday_name && ` (${row.holiday_name})`}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Year-view calendar ────────────────────────────────────────────────────────
// 12-month visualization showing every pay date across all active schedules.

function YearCalendar({ schedules }: { schedules: PaySchedule[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [datesBySchedule, setDatesBySchedule] = useState<Map<string, NextPayDateRow[]>>(new Map());
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);

  const COLOURS = useMemo(() => [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
  ], []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fetch up to 24 dates per schedule to cover this year + a bit of next
      const map = new Map<string, NextPayDateRow[]>();
      await Promise.all(schedules.filter((s) => s.is_active).map(async (s) => {
        const rows = await fetchNextDates(s.id, 24);
        map.set(s.id, rows.filter((r) => new Date(r.pay_date).getFullYear() === year));
      }));
      setDatesBySchedule(map);

      // Holidays for the year
      const { data: hol } = await supabase
        .from('public_holidays')
        .select('holiday_date, name')
        .eq('country_code', 'NG')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
        .order('holiday_date');
      setHolidays((hol ?? []) as PublicHoliday[]);
      setLoading(false);
    })();
  }, [schedules, year]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Pay year — {year}</h3>
          <p className="text-xs text-muted-foreground">
            Every active schedule's pay dates plotted across the year. Hover a dot for details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setYear((y) => y - 1)}>‹</Button>
          <span className="text-sm font-medium tabular-nums w-12 text-center">{year}</span>
          <Button size="sm" variant="outline" onClick={() => setYear((y) => y + 1)}>›</Button>
        </div>
      </div>

      {/* Legend */}
      {schedules.filter((s) => s.is_active).length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {schedules.filter((s) => s.is_active).map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', COLOURS[i % COLOURS.length])} />
              <span className="text-muted-foreground">{s.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span className="text-muted-foreground">Public holiday</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, m) => {
            const monthDate = new Date(year, m, 1);
            const monthName = monthDate.toLocaleString('en-GB', { month: 'long' });
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            const firstDay = (monthDate.getDay() + 6) % 7; // Mon=0
            return (
              <Card key={m} className="overflow-hidden">
                <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
                  <span className="text-sm font-semibold">{monthName}</span>
                  <span className="text-xs text-muted-foreground">{year}</span>
                </div>
                <CardContent className="p-3">
                  <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground mb-1">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <span key={i} className="text-center">{d}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`pad-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const cellDate = new Date(year, m, day);
                      const cellKey = cellDate.toISOString().slice(0, 10);
                      const isToday = cellDate.getTime() === today.getTime();
                      const isPast = cellDate < today;

                      const holiday = holidays.find((h) => h.holiday_date === cellKey);
                      const payHits: { schedule: PaySchedule; row: NextPayDateRow; idx: number }[] = [];
                      schedules.forEach((s, idx) => {
                        const rows = datesBySchedule.get(s.id) ?? [];
                        const hit = rows.find((r) => r.pay_date === cellKey);
                        if (hit) payHits.push({ schedule: s, row: hit, idx });
                      });

                      const cell = (
                        <div
                          className={cn(
                            'aspect-square rounded text-center text-[11px] flex items-center justify-center relative cursor-default',
                            isToday && 'ring-2 ring-primary ring-offset-1',
                            isPast && payHits.length === 0 && !holiday && 'text-muted-foreground/40',
                            !isPast && payHits.length === 0 && !holiday && 'text-muted-foreground hover:bg-muted/40',
                            holiday && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold',
                            payHits.length > 0 && 'font-bold',
                          )}
                        >
                          {day}
                          {payHits.length > 0 && (
                            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                              {payHits.slice(0, 3).map((h) => (
                                <span
                                  key={h.schedule.id}
                                  className={cn('h-1 w-1 rounded-full', COLOURS[h.idx % COLOURS.length])}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );

                      if (payHits.length === 0 && !holiday) return <div key={day}>{cell}</div>;

                      return (
                        <Tooltip key={day}>
                          <TooltipTrigger asChild><div>{cell}</div></TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold">{formatDate(cellDate)}</p>
                              {holiday && (
                                <p className="text-amber-300 flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" /> {holiday.name}
                                </p>
                              )}
                              {payHits.map((h) => (
                                <div key={h.schedule.id} className="flex items-center gap-1.5">
                                  <span className={cn('h-2 w-2 rounded-full', COLOURS[h.idx % COLOURS.length])} />
                                  <span>{h.schedule.name}</span>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PayGroupsManager ─────────────────────────────────────────────────────────
// Inline manager that lets Finance bind employees / contractors / drivers to
// specific pay schedules.

interface GroupMember {
  id: string;
  full_name: string | null;
  email: string;
  department_name: string | null;
  salary_ngn: number | null;
}

// Rotating icon colour per pay group — purely a visual anchor so groups
// are easy to tell apart at a glance in the card list; carries no semantic
// meaning (unlike the mockup's colours, which implied a fixed employee/
// contractor/partner taxonomy this app doesn't actually model).
const PG_ICON_COLOURS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function PayGroupsManager({ schedules }: { schedules: PaySchedule[] }) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [groups, setGroups] = useState<PayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [memberCosts, setMemberCosts] = useState<Record<string, number>>({});
  const [memberPreview, setMemberPreview] = useState<Record<string, string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PayGroup | null>(null);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    pay_schedule_id: string;
    role_filter: string[];
  }>({ name: '', description: '', pay_schedule_id: '', role_filter: [] });
  const [saving, setSaving] = useState(false);

  // Member management state
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersGroup, setMembersGroup] = useState<PayGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<GroupMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [groupsRes, countsRes] = await Promise.all([
      supabase.from('pay_groups').select('id, name, description, pay_schedule_id, role_filter').order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('pay_group_id, salary_ngn, status, full_name, email')
        .eq('status', 'active')
        .not('pay_group_id', 'is', null),
    ]);
    setGroups((groupsRes.data as PayGroup[]) ?? []);
    const counts: Record<string, number> = {};
    const costs: Record<string, number> = {};
    const preview: Record<string, string[]> = {};
    (countsRes.data ?? []).forEach((r: any) => {
      counts[r.pay_group_id] = (counts[r.pay_group_id] ?? 0) + 1;
      costs[r.pay_group_id] = (costs[r.pay_group_id] ?? 0) + (r.salary_ngn ?? 0);
      (preview[r.pay_group_id] ??= []).push(r.full_name || r.email || '?');
    });
    setMemberCounts(counts);
    setMemberCosts(costs);
    setMemberPreview(preview);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', pay_schedule_id: '', role_filter: [] });
    setDialogOpen(true);
  };

  const openEdit = (g: PayGroup) => {
    setEditing(g);
    setForm({
      name: g.name,
      description: g.description ?? '',
      pay_schedule_id: g.pay_schedule_id ?? '',
      role_filter: g.role_filter,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Group name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        pay_schedule_id: form.pay_schedule_id || null,
        role_filter: form.role_filter,
        created_by: profile?.id,
      };
      if (editing) {
        const { error } = await supabase.from('pay_groups').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pay_groups').insert(payload);
        if (error) throw error;
      }
      toast({ title: editing ? 'Group updated' : 'Group created' });
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      toast({ title: 'Save failed', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: PayGroup) => {
    const { error } = await supabase.from('pay_groups').delete().eq('id', g.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      toast({ title: 'Group deleted' });
    }
  };

  const openMembers = async (g: PayGroup) => {
    setMembersGroup(g);
    setMembersDialogOpen(true);
    setMembersLoading(true);
    setMemberSearch('');
    const [membersRes, allRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, salary_ngn, department:departments!profiles_department_id_fkey(name)')
        .eq('pay_group_id', g.id)
        .eq('status', 'active')
        .order('full_name'),
      supabase
        .from('profiles')
        .select('id, full_name, email, salary_ngn, department:departments!profiles_department_id_fkey(name)')
        .eq('status', 'active')
        .is('pay_group_id', null)
        .order('full_name'),
    ]);
    setMembers(
      (membersRes.data ?? []).map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        salary_ngn: r.salary_ngn,
        department_name: r.department?.name ?? null,
      })),
    );
    setAvailableEmployees(
      (allRes.data ?? []).map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        salary_ngn: r.salary_ngn,
        department_name: r.department?.name ?? null,
      })),
    );
    setMembersLoading(false);
  };

  const addMember = async (emp: GroupMember) => {
    if (!membersGroup) return;
    // .select() lets us detect the RLS-silent-no-op case: PostgREST returns
    // no error when a row is filtered out by policy, just zero rows back.
    // Without this check the UI would optimistically show the employee as
    // added even though nothing was actually written.
    const { data, error } = await supabase
      .from('profiles')
      .update({ pay_group_id: membersGroup.id })
      .eq('id', emp.id)
      .select('id');
    if (error) {
      toast({ title: 'Could not add member', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data?.length) {
      toast({ title: 'Could not add member', description: "You don't have permission to change this employee's pay group.", variant: 'destructive' });
      return;
    }
    setMembers((prev) => [...prev, emp]);
    setAvailableEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    setMemberCounts((prev) => ({ ...prev, [membersGroup.id]: (prev[membersGroup.id] ?? 0) + 1 }));
    setMemberCosts((prev) => ({ ...prev, [membersGroup.id]: (prev[membersGroup.id] ?? 0) + (emp.salary_ngn ?? 0) }));
  };

  const removeMember = async (emp: GroupMember) => {
    if (!membersGroup) return;
    const { data, error } = await supabase
      .from('profiles')
      .update({ pay_group_id: null })
      .eq('id', emp.id)
      .select('id');
    if (error) {
      toast({ title: 'Could not remove member', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data?.length) {
      toast({ title: 'Could not remove member', description: "You don't have permission to change this employee's pay group.", variant: 'destructive' });
      return;
    }
    setMembers((prev) => prev.filter((e) => e.id !== emp.id));
    setAvailableEmployees((prev) => [...prev, emp].sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email)));
    setMemberCounts((prev) => ({ ...prev, [membersGroup.id]: Math.max(0, (prev[membersGroup.id] ?? 0) - 1) }));
    setMemberCosts((prev) => ({ ...prev, [membersGroup.id]: Math.max(0, (prev[membersGroup.id] ?? 0) - (emp.salary_ngn ?? 0)) }));
  };

  const filteredAvailable = useMemo(() => {
    if (!memberSearch.trim()) return availableEmployees;
    const q = memberSearch.toLowerCase();
    return availableEmployees.filter(
      (e) =>
        (e.full_name ?? '').toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.department_name ?? '').toLowerCase().includes(q),
    );
  }, [availableEmployees, memberSearch]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Pay Groups
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Group employees by cadence. Contractors might be paid bi-weekly while salaried staff are paid monthly — each group binds to its own schedule.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New group
        </Button>
      </div>

      <div className="flex gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">What's a pay group? </span>
          It's simply <span className="font-medium text-foreground">"who gets paid together, the same way."</span> Every
          payroll run belongs to one pay group — that's what decides who's included, on what cadence, and which deductions
          apply. Most companies need more than one: salaried employees (PAYE, Pension, NHF, NSITF, ITF all apply) are a
          different group from contractors (only withholding tax applies), since mixing them into one run would apply the
          wrong deductions to the wrong people.
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : groups.length === 0 ? (
        <EmptyState
          illustration="satellite"
          title="No pay groups yet"
          description="Create groups like 'Salaried Staff', 'Drivers' or 'Contractors' so each can be paid on its own cadence."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New group</Button>}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g, i) => {
            const sched = schedules.find((s) => s.id === g.pay_schedule_id);
            const names = memberPreview[g.id] ?? [];
            const count = memberCounts[g.id] ?? 0;
            return (
              <Card key={g.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]', PG_ICON_COLOURS[i % PG_ICON_COLOURS.length])}>
                        <Users className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{g.name}</p>
                        {g.description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">{g.description}</p>}
                        {g.role_filter.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {g.role_filter.map((r) => (
                              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-semibold" onClick={() => openEdit(g)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Delete ${g.name}`}
                        onClick={() => remove(g)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border/50 pt-3.5">
                    <button type="button" onClick={() => openMembers(g)} className="text-left group">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Members</p>
                      {count > 0 ? (
                        <div className="flex items-center -space-x-1.5 mt-1.5">
                          {names.slice(0, 4).map((n, idx) => (
                            <span
                              key={idx}
                              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[9.5px] font-bold text-foreground"
                            >
                              {initialsOf(n)}
                            </span>
                          ))}
                          {count > 4 && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-bold text-muted-foreground">
                              +{count - 4}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 group-hover:underline">Add members</p>
                      )}
                    </button>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cadence</p>
                      <p className="text-sm font-medium mt-1">
                        {sched ? sched.name : <span className="italic text-muted-foreground font-normal">Unassigned</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Monthly cost</p>
                      <p className="text-sm font-semibold tabular-nums mt-1">{formatNaira(memberCosts[g.id] ?? 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold flex items-center gap-1.5 text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Why would I need more than one pay group?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-3">
            {[
              { title: 'Different deductions', body: 'Salaried staff need PAYE, Pension, NHF, NSITF and ITF calculated; contractors and other categories may not — mixing them into one run applies the wrong tax treatment.' },
              { title: 'Different cadences', body: 'Salaried staff might be paid monthly while contractors are paid bi-weekly or by retainer. Each group binds to its own pay schedule instead of forcing one calendar on everyone.' },
              { title: 'Cleaner review', body: 'A run scoped to one pay group is a shorter, more reviewable list — an approver checking "did everyone in this group get the right amount" isn’t sifting through people who don’t belong in this run at all.' },
            ].map((item) => (
              <div key={item.title}>
                <p className="text-xs font-semibold">{item.title}</p>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit pay group' : 'New pay group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Group name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Salaried Staff"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Who's in this group, why they're paid this way…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pay schedule</Label>
              <Select
                value={form.pay_schedule_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, pay_schedule_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unassigned —</SelectItem>
                  {schedules.filter((s) => s.is_active).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Members management dialog ─────────────────────────────── */}
      <Dialog open={membersDialogOpen} onOpenChange={(v) => { if (!v) setMembersDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {membersGroup?.name} — Members
            </DialogTitle>
          </DialogHeader>
          {membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
              {members.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Current members ({members.length})
                    </p>
                    <p className="text-xs font-semibold tabular-nums">
                      {formatNaira(members.reduce((s, m) => s + (m.salary_ngn ?? 0), 0))}/mo
                    </p>
                  </div>
                  <div className="space-y-1">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{m.full_name || m.email}</p>
                          {m.department_name && (
                            <p className="text-xs text-muted-foreground">{m.department_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">{formatNaira(m.salary_ngn ?? 0)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => removeMember(m)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Add employees
                </p>
                <Input
                  placeholder="Search by name, email, or department…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="mb-2"
                />
                {filteredAvailable.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {availableEmployees.length === 0
                      ? 'All active employees are already in a pay group.'
                      : 'No matches.'}
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {filteredAvailable.slice(0, 50).map((e) => (
                      <div key={e.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm">{e.full_name || e.email}</p>
                          {e.department_name && (
                            <p className="text-xs text-muted-foreground">{e.department_name}</p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => addMember(e)}>
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                    ))}
                    {filteredAvailable.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        {filteredAvailable.length - 50} more — narrow your search
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── HolidaysManager ──────────────────────────────────────────────────────────

function HolidaysManager() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [items, setItems] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ holiday_date: '', name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('public_holidays')
      .select('id, holiday_date, name')
      .eq('country_code', 'NG')
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
      .order('holiday_date');
    setItems((data as PublicHoliday[]) ?? []);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const addHoliday = async () => {
    if (!newItem.holiday_date || !newItem.name.trim()) return;
    const { error } = await supabase.from('public_holidays').insert({
      country_code: 'NG',
      holiday_date: newItem.holiday_date,
      name: newItem.name,
    });
    if (!error) {
      setNewItem({ holiday_date: '', name: '' });
      setAdding(false);
      load();
    }
  };

  const removeHoliday = async (id: string) => {
    await supabase.from('public_holidays').delete().eq('id', id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Public holidays — {year}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pay dates that land on these days are auto-rolled to the previous (or next) business day depending on each schedule's adjustment policy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setYear((y) => y - 1)}>‹</Button>
          <span className="text-sm font-medium w-12 text-center">{year}</span>
          <Button size="sm" variant="outline" onClick={() => setYear((y) => y + 1)}>›</Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Holiday</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{formatDate(new Date(h.holiday_date))}</TableCell>
                    <TableCell>{h.name}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Delete holiday"
                        onClick={() => removeHoliday(h.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground text-center py-8">
                      No holidays defined for {year}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={adding} onOpenChange={(v) => { if (!v) setAdding(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add public holiday</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={newItem.holiday_date}
                onChange={(e) => setNewItem((s) => ({ ...s, holiday_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newItem.name}
                onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Sallah day"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={addHoliday}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── PayScheduleForm with presets ────────────────────────────────────────────

function PayScheduleForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const needsSecondAnchor = form.frequency === 'semimonthly';
  const isWeekBased = form.frequency === 'biweekly' || form.frequency === 'weekly';
  const isOffCycle = form.schedule_kind === 'off_cycle';

  const applyPreset = (preset: SchedulePreset) => {
    setForm((f) => ({
      ...f,
      ...preset.config,
      name: f.name || preset.label,
    } as FormState));
  };

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Quick start — choose a Nigeria-standard template
        </Label>
        <div className="grid grid-cols-1 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              className="text-left px-3 py-2 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition"
            >
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border/40" />

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Pay frequency</Label>
          <Select
            value={form.frequency}
            onValueChange={(v) => {
              const isWeek = v === 'weekly' || v === 'biweekly';
              setForm((f) => ({
                ...f,
                frequency: v as PayFrequency,
                anchor_day: isWeek ? 5 : 25,
                second_anchor_day: v === 'semimonthly' ? 15 : null,
              }));
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Bi-weekly (every 2 weeks)</SelectItem>
              <SelectItem value="semimonthly">Semi-monthly (2× / month)</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="bimonthly">Bi-monthly (every 2 months)</SelectItem>
              <SelectItem value="quarterly">Quarterly (every 3 months)</SelectItem>
              <SelectItem value="triannual">Tri-annual (3× / year)</SelectItem>
              <SelectItem value="biannual">Bi-annual (2× / year)</SelectItem>
              <SelectItem value="annual">Annual (1× / year)</SelectItem>
            </SelectContent>
          </Select>
        </div>

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

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          Weekend / holiday adjustment
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              If the pay date falls on a weekend or recognized public holiday, move it to the previous or next business day.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Auto-draft (days before pay date)
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                The system will auto-generate a draft payroll run this many days before the pay date.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            type="number" min={1} max={30}
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
                After the cutoff date, no further changes to salaries / deductions can be applied to this run.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            type="number" min={0} max={20}
            value={form.cutoff_lead_days}
            onChange={(e) =>
              setForm((f) => ({ ...f, cutoff_lead_days: Math.max(0, Number(e.target.value)) }))
            }
          />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border/60 px-4 py-3 bg-muted/30">
        <div className="flex-1">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-500" />
            Auto-approve drafts
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            If enabled, auto-generated drafts are immediately approved — no manual review.
            Use only when you trust the data is always correct.
          </p>
        </div>
        <Switch
          checked={form.auto_approve}
          onCheckedChange={(v) => setForm((f) => ({ ...f, auto_approve: v }))}
        />
      </div>

      <div className="border-t border-border/40" />

      {/* Schedule kind */}
      <div className="space-y-1.5">
        <Label>Schedule type</Label>
        <Select
          value={form.schedule_kind}
          onValueChange={(v) => setForm((f) => ({
            ...f,
            schedule_kind: v as ScheduleKind,
            linked_schedule_id: v === 'regular' ? null : f.linked_schedule_id,
            allowance_context: v === 'regular' ? null : f.allowance_context,
          }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">Regular payroll</SelectItem>
            <SelectItem value="off_cycle">Off-cycle (bonus, 13th month, etc.)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isOffCycle && (
        <div className="space-y-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Off-cycle configuration</p>
          <div className="space-y-1.5">
            <Label>Allowance context</Label>
            <Input
              value={form.allowance_context ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, allowance_context: e.target.value || null }))}
              placeholder="e.g. 13th month salary, performance bonus, leave encashment"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ScheduleAuditTrail ──────────────────────────────────────────────────────

function ScheduleAuditTrail({ scheduleId }: { scheduleId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pay_schedule_audit')
        .select('id, action, diff_json, created_at, profiles:actor_id(full_name)')
        .eq('pay_schedule_id', scheduleId)
        .order('created_at', { ascending: false })
        .limit(20);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [scheduleId]);

  if (loading) return <p className="text-xs text-muted-foreground">Loading history…</p>;
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No changes recorded yet.</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3 text-xs">
          <History className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p>
              <span className="font-semibold capitalize">{r.action}</span>
              {r.profiles?.full_name && <> by {r.profiles.full_name}</>}
              <span className="text-muted-foreground"> · {formatDate(new Date(r.created_at))}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PayrollSchedules (main export) ──────────────────────────────────────────

// The four things a working payroll setup actually needs, computed from
// real data rather than a separate onboarding-progress flag — this is a
// single-tenant app (company_settings has no per-tenant row), so there's
// no "new company signup" moment to gate; this is just an honest readout
// of what Setup is still missing, useful at any point, not just once.
type SetupItem = { key: string; label: string; done: boolean; action: () => void };

function SetupChecklist({ items }: { items: SetupItem[] }) {
  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3.5 py-3">
      <span className="text-xs font-semibold text-muted-foreground shrink-0">Finish setting up payroll:</span>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => !item.done && item.action()}
          disabled={item.done}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold kd-transition',
            item.done
              ? 'border-success/40 bg-success/10 text-success cursor-default'
              : 'border-border/70 bg-card hover:border-primary/40 hover:text-primary',
          )}
        >
          <span className={cn(
            'flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
            item.done ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
          )}>
            {item.done ? <Check className="h-2.5 w-2.5" /> : null}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function PayrollSchedules() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { data: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<PaySchedule[]>([]);
  const [nextDates, setNextDates] = useState<Record<string, NextPayDateRow[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaySchedule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaySchedule | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<'list' | 'calendar' | 'groups' | 'holidays'>('list');
  // Quick-glance counts so the other three sub-tabs don't have to be opened
  // blind just to see whether there's anything in them.
  const [payGroupCount, setPayGroupCount] = useState<number | null>(null);
  const [holidayCount, setHolidayCount] = useState<number | null>(null);

  const loadQuickCounts = useCallback(async () => {
    const year = new Date().getFullYear();
    const [groupsRes, holidaysRes] = await Promise.all([
      supabase.from('pay_groups').select('id', { count: 'exact', head: true }),
      supabase.from('public_holidays').select('id', { count: 'exact', head: true })
        .eq('country_code', 'NG')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`),
    ]);
    setPayGroupCount(groupsRes.count ?? 0);
    setHolidayCount(holidaysRes.count ?? 0);
  }, []);

  useEffect(() => { loadQuickCounts(); }, [loadQuickCounts]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pay_schedules')
      .select('id, name, frequency, anchor_day, second_anchor_day, day_adjustment, processing_lead_days, cutoff_lead_days, auto_approve, notify_roles, is_active, schedule_kind, linked_schedule_id, allowance_context')
      .order('created_at', { ascending: true });
    const list = (data as PaySchedule[]) ?? [];
    setSchedules(list);

    const map: Record<string, NextPayDateRow[]> = {};
    await Promise.all(list.map(async (s) => {
      map[s.id] = await fetchNextDates(s.id, 6);
    }));
    setNextDates(map);
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
      name: s.name, frequency: s.frequency, anchor_day: s.anchor_day,
      second_anchor_day: s.second_anchor_day, day_adjustment: s.day_adjustment,
      processing_lead_days: s.processing_lead_days, cutoff_lead_days: s.cutoff_lead_days,
      auto_approve: s.auto_approve, notify_roles: s.notify_roles, is_active: s.is_active,
      schedule_kind: s.schedule_kind ?? 'regular',
      linked_schedule_id: s.linked_schedule_id ?? null,
      allowance_context: s.allowance_context ?? null,
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
      const payload = { ...form, created_by: profile?.id };
      if (editing) {
        const { error } = await supabase.from('pay_schedules').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Schedule updated' });
      } else {
        const { error } = await supabase.from('pay_schedules').insert(payload);
        if (error) throw error;
        toast({ title: 'Schedule created' });
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      toast({ title: 'Failed to save schedule', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: PaySchedule) => {
    const { error } = await supabase
      .from('pay_schedules').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } else {
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('pay_schedules').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Cannot delete', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Schedule deleted' });
      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const setupItems: SetupItem[] = [
    { key: 'company', label: 'Company details', done: !!(companySettings?.company_name && companySettings?.rc_number), action: () => navigate('/settings') },
    { key: 'schedule', label: 'Pay schedule', done: schedules.length > 0, action: () => { setInnerTab('list'); openCreate(); } },
    { key: 'groups', label: 'Pay groups', done: (payGroupCount ?? 0) > 0, action: () => setInnerTab('groups') },
    { key: 'holidays', label: 'Public holidays', done: (holidayCount ?? 0) > 0, action: () => setInnerTab('holidays') },
  ];

  return (
    <div className="space-y-6">
      {!loading && payGroupCount !== null && holidayCount !== null && (
        <SetupChecklist items={setupItems} />
      )}
      <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as any)}>
        <TabsList>
          <TabsTrigger value="list"><CalendarClock className="mr-2 h-4 w-4" />Schedules</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="mr-2 h-4 w-4" />Pay Year</TabsTrigger>
          <TabsTrigger value="groups">
            <Users className="mr-2 h-4 w-4" />Pay Groups
            {payGroupCount !== null && (
              <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">({payGroupCount})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <Sparkles className="mr-2 h-4 w-4" />Holidays
            {holidayCount !== null && (
              <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">({holidayCount})</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Schedules list ─────────────────────────────────────────────────── */}
        <TabsContent value="list" className="space-y-6 mt-6">
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

          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex gap-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
            <div className="space-y-1">
              <p className="font-medium">How auto-scheduling works</p>
              <ol className="list-decimal pl-4 space-y-0.5 text-xs leading-relaxed">
                <li>Define a pay schedule (frequency, pay day, lead times) — pick a Nigeria-standard preset to skip the setup.</li>
                <li>Optionally bind employees to <strong>pay groups</strong> that map to different schedules (salaried staff vs. drivers vs. contractors).</li>
                <li>The scheduler runs daily at 06:00 UTC, opens a processing window N days before each pay date and auto-creates a draft.</li>
                <li>Public holidays from the Holidays tab roll the pay date to the prior (or next) business day automatically.</li>
                <li>Variance alerts flag drafts whose total burn drifts &gt;10% from the prior period — protection against bad data.</li>
                <li>After the cutoff date, no further changes can be applied to a run's data.</li>
              </ol>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : schedules.length === 0 ? (
            <EmptyState
              illustration="coin"
              title="No pay schedules yet"
              description="Create your first pay schedule and let KDOps auto-draft payroll runs on time, every time."
              action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New schedule</Button>}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
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
                      const rows = nextDates[s.id] ?? [];
                      const next = rows[0];
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
                                  className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', isExpanded && 'rotate-90')}
                                />
                                {s.name}
                                {s.schedule_kind === 'off_cycle' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                                    Off-cycle
                                  </span>
                                )}
                                {s.auto_approve && (
                                  <Tooltip>
                                    <TooltipTrigger><Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" /></TooltipTrigger>
                                    <TooltipContent>Auto-approve enabled</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{FREQ_LABELS[s.frequency]}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{anchorLabel(s)}</TableCell>
                            <TableCell>{next ? <NextPayDatePill row={next} /> : '—'}</TableCell>
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
                              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => openEdit(s)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  aria-label="Delete"
                                  onClick={() => setDeleteTarget(s)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${s.id}-expanded`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={6} className="py-4 px-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                      Next 6 pay dates
                                    </p>
                                    <div className="space-y-2">
                                      {rows.map((r, i) => {
                                        const d = new Date(r.pay_date);
                                        const days = daysUntil(d);
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
                                                {r.holiday_name && (
                                                  <Tooltip>
                                                    <TooltipTrigger>
                                                      <Sparkles className="h-3 w-3 text-amber-500" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      Adjusted from {formatDate(new Date(r.adjusted_from!))} ({r.holiday_name})
                                                    </TooltipContent>
                                                  </Tooltip>
                                                )}
                                              </div>
                                              <p className="text-xs text-muted-foreground mt-0.5">
                                                Draft opens {formatDate(new Date(r.draft_open_date))} · Cutoff {formatDate(new Date(r.cutoff_date))}
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

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
                                        <dd className="font-medium">{s.processing_lead_days}d before</dd>
                                      </div>
                                      <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Data cutoff</dt>
                                        <dd className="font-medium">{s.cutoff_lead_days}d before</dd>
                                      </div>
                                      <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Auto-approve drafts</dt>
                                        <dd className={cn('font-medium', s.auto_approve ? 'text-amber-600' : 'text-muted-foreground')}>
                                          {s.auto_approve ? 'Yes' : 'No (manual review)'}
                                        </dd>
                                      </div>
                                      <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Type</dt>
                                        <dd className="font-medium">{s.schedule_kind === 'off_cycle' ? 'Off-cycle' : 'Regular'}</dd>
                                      </div>
                                      {s.allowance_context && (
                                        <div className="flex justify-between">
                                          <dt className="text-muted-foreground">Context</dt>
                                          <dd className="font-medium">{s.allowance_context}</dd>
                                        </div>
                                      )}
                                    </dl>
                                  </div>

                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                      Recent activity
                                    </p>
                                    <ScheduleAuditTrail scheduleId={s.id} />
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
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Pay Year calendar ──────────────────────────────────────────────── */}
        <TabsContent value="calendar" className="mt-6">
          <YearCalendar schedules={schedules} />
        </TabsContent>

        {/* ── Pay Groups ─────────────────────────────────────────────────────── */}
        <TabsContent value="groups" className="mt-6">
          <PayGroupsManager schedules={schedules} />
        </TabsContent>

        {/* ── Holidays ───────────────────────────────────────────────────────── */}
        <TabsContent value="holidays" className="mt-6">
          <HolidaysManager />
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit pay schedule' : 'New pay schedule'}</DialogTitle>
          </DialogHeader>
          <PayScheduleForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            system will no longer auto-draft runs for it.
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

// ─── NextPayrollBanner ────────────────────────────────────────────────────────

export function NextPayrollBanner({ onStartDraft }: { onStartDraft?: () => void }) {
  const [next, setNext] = useState<{ date: Date; scheduleName: string; draftDate: Date; holiday: string | null } | null>(null);
  const [variance, setVariance] = useState<{ severity: 'warning' | 'critical'; runId: string; reason: string } | null>(null);
  const [activeEmployeeCount, setActiveEmployeeCount] = useState<number | null>(null);
  const [nextPeriodHasDraft, setNextPeriodHasDraft] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pay_schedules').select('id, name').eq('is_active', true)
        .order('created_at', { ascending: true });
      if (!data?.length) return;

      let earliest: typeof next = null;
      for (const s of data as PaySchedule[]) {
        const rows = await fetchNextDates(s.id, 1);
        if (!rows[0]) continue;
        const d = new Date(rows[0].pay_date);
        if (!earliest || d < earliest.date) {
          earliest = {
            date: d,
            scheduleName: s.name,
            draftDate: new Date(rows[0].draft_open_date),
            holiday: rows[0].holiday_name,
          };
        }
      }
      setNext(earliest);

      const { count } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true })
        .eq('status', 'active').neq('role', 'driver');
      setActiveEmployeeCount(count ?? 0);

      if (earliest) {
        const period = `${earliest.date.getFullYear()}-${String(earliest.date.getMonth() + 1).padStart(2, '0')}`;
        const { count: draftCount } = await supabase
          .from('payroll_runs').select('id', { count: 'exact', head: true })
          .eq('period', period);
        setNextPeriodHasDraft((draftCount ?? 0) > 0);
      }

      // Surface highest-severity recent variance
      const { data: vrows } = await supabase
        .from('payroll_run_variance')
        .select('payroll_run_id, severity, reason')
        .in('severity', ['warning', 'critical'])
        .order('computed_at', { ascending: false })
        .limit(1);
      if (vrows?.[0]) {
        setVariance({
          severity: vrows[0].severity,
          runId: vrows[0].payroll_run_id,
          reason: vrows[0].reason,
        });
      }
    })();
  }, []);

  if (!next && !variance) return null;

  return (
    <div className="space-y-2">
      {next && (
        <div className="flex items-center gap-3.5 rounded-lg px-5 py-4 text-white bg-gradient-to-br from-[hsl(200,100%,29%)] to-[hsl(200,90%,20%)] shadow-sm">
          <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <CalendarClock className="h-[18px] w-[18px]" />
          </div>
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-bold">
              {next.scheduleName} payroll is due {daysUntil(next.date) === 0 ? 'today' : daysUntil(next.date) === 1 ? 'tomorrow' : `in ${daysUntil(next.date)} days`}
              {' '}
              <span className="font-normal opacity-80">({formatDate(next.date)})</span>
            </div>
            <div className="text-[12.5px] opacity-80 mt-0.5">
              {activeEmployeeCount !== null && `${activeEmployeeCount} active employees on the ${next.scheduleName.toLowerCase()} schedule`}
              {nextPeriodHasDraft ? ' · draft already started' : ' · no draft started yet'}
              {next.holiday && ` · auto-rolled around ${next.holiday}`}
              {daysUntil(next.draftDate) <= 0 && ' · processing window is open'}
            </div>
          </div>
          {onStartDraft && !nextPeriodHasDraft && (
            <Button size="sm" onClick={onStartDraft} className="bg-white text-[hsl(200,100%,29%)] hover:bg-white/90 shrink-0">
              Start draft
            </Button>
          )}
        </div>
      )}

      {variance && (
        <div className={cn(
          'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
          variance.severity === 'critical'
            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 text-red-800 dark:text-red-200'
            : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200',
        )}>
          {variance.severity === 'critical'
            ? <TrendingDown className="h-4 w-4 shrink-0" />
            : <TrendingUp className="h-4 w-4 shrink-0" />}
          <div className="flex-1 min-w-0">
            <span className="font-semibold">Variance flag — </span>
            {variance.reason}
            {' '}
            <a href={`/payroll?run=${variance.runId}`} className="underline">Review</a>
          </div>
        </div>
      )}
    </div>
  );
}
