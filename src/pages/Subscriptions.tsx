import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  CalendarClock,
  Repeat,
  DollarSign,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { APPROVER_ROLES, hasRole } from '@/lib/roles';
import { daysUntil, formatDate, formatNaira, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';

interface Subscription {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  amount_ngn: number;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  next_renewal_date: string;
  last_renewed_at: string | null;
  status: 'active' | 'cancelled';
  notes: string | null;
  owner_id: string | null;
  department_id: string | null;
}

const CATEGORIES = ['software', 'hosting', 'office', 'telecom', 'finance', 'other'];
const CYCLES: Subscription['billing_cycle'][] = ['monthly', 'quarterly', 'yearly'];

const cycleLabel = (c: string) =>
  c.charAt(0).toUpperCase() + c.slice(1);

// Advance a date by one billing cycle. Input is ISO yyyy-mm-dd.
const nextDate = (iso: string, cycle: string): string => {
  const d = new Date(iso);
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return toIsoDate(d);
};

// Monthly equivalent amount for the "monthly spend" card.
const monthlyEquivalent = (sub: Subscription): number => {
  switch (sub.billing_cycle) {
    case 'monthly':
      return sub.amount_ngn;
    case 'quarterly':
      return sub.amount_ngn / 3;
    case 'yearly':
      return sub.amount_ngn / 12;
    default:
      return sub.amount_ngn;
  }
};

interface FormState {
  name: string;
  vendor: string;
  category: string;
  amount_ngn: string;
  billing_cycle: Subscription['billing_cycle'];
  next_renewal_date: string;
  notes: string;
}

const emptyForm: FormState = {
  name: '',
  vendor: '',
  category: 'software',
  amount_ngn: '',
  billing_cycle: 'monthly',
  next_renewal_date: toIsoDate(new Date()),
  notes: '',
};

const Subscriptions = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const canManage = hasRole(profile?.role, APPROVER_ROLES);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Subscription | null>(null);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('next_renewal_date', { ascending: true })
      .limit(200);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSubs((data as Subscription[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubs();
  }, [fetchSubs]);

  // In-app renewal notifications for 7/3/1 day buckets.
  useEffect(() => {
    if (loading || subs.length === 0 || !profile) return;
    const unique: Record<number, Subscription[]> = { 7: [], 3: [], 1: [] };
    for (const s of subs) {
      if (s.status !== 'active') continue;
      const d = daysUntil(s.next_renewal_date);
      if (d === null) continue;
      if (d === 7) unique[7].push(s);
      else if (d === 3) unique[3].push(s);
      else if (d === 1) unique[1].push(s);
    }

    const write = async (list: Subscription[], days: number) => {
      if (list.length === 0) return;
      const title =
        days === 1
          ? 'Subscription renewal tomorrow'
          : `Subscription renewal in ${days} days`;
      const body = list
        .map((s) => `${s.name} (${formatNaira(s.amount_ngn)})`)
        .slice(0, 5)
        .join(', ');
      try {
        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'subscription_renewal',
          title,
          body,
        });
      } catch {
        // ignore — notifications are best effort.
      }
    };
    write(unique[7], 7);
    write(unique[3], 3);
    write(unique[1], 1);
  }, [subs, loading, profile]);

  const stats = useMemo(() => {
    const active = subs.filter((s) => s.status === 'active');
    const monthly = active.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
    const nextIn30 = active.filter((s) => {
      const d = daysUntil(s.next_renewal_date);
      return d !== null && d >= 0 && d <= 30;
    });
    return {
      monthly,
      active: active.length,
      dueSoon: nextIn30.length,
    };
  }, [subs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.vendor || '').toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [subs, search, statusFilter, categoryFilter]);

  const pagination = usePagination(filtered, 20);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialog(true);
  };

  const openEdit = (s: Subscription) => {
    setEditing(s);
    setForm({
      name: s.name,
      vendor: s.vendor || '',
      category: s.category,
      amount_ngn: String(s.amount_ngn),
      billing_cycle: s.billing_cycle,
      next_renewal_date: s.next_renewal_date,
      notes: s.notes || '',
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!form.next_renewal_date) {
      toast({ title: 'Next renewal date is required', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(form.amount_ngn);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        vendor: form.vendor || null,
        category: form.category,
        amount_ngn: amount,
        billing_cycle: form.billing_cycle,
        next_renewal_date: form.next_renewal_date,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase
          .from('subscriptions')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        await logAudit(
          'subscription_edited',
          `Subscription "${payload.name}" updated`,
          profile,
        );
        toast({ title: 'Subscription updated' });
      } else {
        const { error } = await supabase.from('subscriptions').insert({
          ...payload,
          status: 'active',
          created_by: profile?.id,
        });
        if (error) throw error;
        await logAudit(
          'subscription_added',
          `Subscription "${payload.name}" added (${formatNaira(amount)} / ${cycleLabel(form.billing_cycle)})`,
          profile,
        );
        toast({ title: 'Subscription added' });
      }
      setDialog(false);
      setEditing(null);
      await fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const markRenewed = async (s: Subscription) => {
    setRenewingId(s.id);
    try {
      const today = toIsoDate(new Date());
      // Compute the next renewal date from the current next_renewal_date (not
      // today) so a skipped renewal doesn't permanently shift the cadence by
      // a day.
      const base =
        new Date(s.next_renewal_date) > new Date()
          ? s.next_renewal_date
          : today;
      const next = nextDate(base, s.billing_cycle);
      const { error } = await supabase
        .from('subscriptions')
        .update({ last_renewed_at: today, next_renewal_date: next })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit(
        'subscription_renewed',
        `Subscription "${s.name}" marked renewed — next: ${formatDate(next)}`,
        profile,
      );
      toast({ title: 'Renewed', description: `Next renewal: ${formatDate(next)}` });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not mark renewed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setRenewingId(null);
    }
  };

  const cancelSub = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit(
        'subscription_cancelled',
        `Subscription "${s.name}" cancelled`,
        profile,
      );
      toast({ title: 'Subscription cancelled' });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not cancel',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const deleteSub = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', s.id);
      if (error) throw error;
      await logAudit(
        'subscription_cancelled',
        `Subscription "${s.name}" deleted`,
        profile,
      );
      toast({ title: 'Subscription deleted' });
      setPendingDelete(null);
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not delete',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const reactivate = async (s: Subscription) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('id', s.id);
      if (error) throw error;
      await logAudit('subscription_edited', `Subscription "${s.name}" reactivated`, profile);
      toast({ title: 'Subscription reactivated' });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: 'Could not reactivate',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const exportCsv = () => {
    const header = [
      'name',
      'vendor',
      'category',
      'amount_ngn',
      'billing_cycle',
      'next_renewal_date',
      'last_renewed_at',
      'status',
    ];
    const rows = filtered.map((s) => [
      s.name,
      s.vendor || '',
      s.category,
      s.amount_ngn,
      s.billing_cycle,
      s.next_renewal_date,
      s.last_renewed_at || '',
      s.status,
    ]);
    downloadCsv(
      `kdops-subscriptions-${toIsoDate(new Date())}.csv`,
      toCsv(header, rows),
    );
    toast({ title: 'CSV exported' });
  };

  const renewalBadge = (s: Subscription) => {
    if (s.status !== 'active') {
      return <Badge variant="secondary">Cancelled</Badge>;
    }
    const d = daysUntil(s.next_renewal_date);
    if (d === null) return <Badge variant="secondary">—</Badge>;
    if (d < 0) return <Badge className="bg-destructive/10 text-destructive">Overdue</Badge>;
    if (d === 0) return <Badge className="bg-warning/10 text-warning">Due today</Badge>;
    if (d <= 7) return <Badge className="bg-warning/10 text-warning">{d}d</Badge>;
    if (d <= 30) return <Badge className="bg-accent/10 text-accent-foreground">{d}d</Badge>;
    return <Badge variant="secondary">{d}d</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Track recurring software and service subscriptions, renewal dates, monthly costs and status. Renewal alerts help you avoid unexpected charges.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Track recurring software and service subscriptions with renewal alerts.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New Subscription
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Monthly Spend"
          value={formatNaira(stats.monthly)}
          subtitle="Normalised across cycles"
          icon={DollarSign}
          tone="primary"
        />
        <StatCard
          title="Active Subscriptions"
          value={stats.active}
          subtitle={`${subs.length - stats.active} cancelled`}
          icon={Repeat}
          tone="success"
        />
        <StatCard
          title="Due in 30 days"
          value={stats.dueSoon}
          subtitle="Renewals upcoming"
          icon={CalendarClock}
          tone="warning"
        />
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subscriptions..."
              className="pl-9 h-10 sm:h-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchSubs} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="coin"
              title="No subscriptions yet"
              description="Add your first recurring software or service to start tracking renewals."
              action={
                canManage ? (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> New Subscription
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Next renewal</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((s) => (
                    <TableRow key={s.id} className="kd-transition">
                      <TableCell>
                        <p className="font-medium">{s.name}</p>
                        {s.vendor && (
                          <p className="text-xs text-muted-foreground">{s.vendor}</p>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{s.category}</TableCell>
                      <TableCell className="text-right currency font-medium">
                        {formatNaira(s.amount_ngn)}
                      </TableCell>
                      <TableCell className="capitalize">{s.billing_cycle}</TableCell>
                      <TableCell>{formatDate(s.next_renewal_date)}</TableCell>
                      <TableCell>{renewalBadge(s)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status === 'active' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canManage || renewingId === s.id}
                                onClick={() => markRenewed(s)}
                              >
                                {renewingId === s.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Mark renewed'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!canManage}
                                onClick={() => openEdit(s)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!canManage}
                                onClick={() => cancelSub(s)}
                                title="Cancel"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canManage}
                                onClick={() => reactivate(s)}
                              >
                                Reactivate
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!canManage}
                                onClick={() => setPendingDelete(s)}
                                title="Delete permanently"
                                aria-label={`Delete subscription ${s.name}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Subscription' : 'New Subscription'}
            </DialogTitle>
            <DialogDescription>
              Recurring software or service — KDOps will remind you 7, 3, and 1 day before
              the renewal date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Figma Organization Plan"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vendor</Label>
                <Input
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="e.g. Figma Inc."
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  value={form.amount_ngn}
                  onChange={(e) => setForm({ ...form, amount_ngn: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Billing cycle</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(v) =>
                    setForm({ ...form, billing_cycle: v as Subscription['billing_cycle'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {cycleLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Next renewal date</Label>
              <Input
                type="date"
                value={form.next_renewal_date}
                onChange={(e) =>
                  setForm({ ...form, next_renewal_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes about owners, seat counts, contract terms..."
              />
            </div>

            {!canManage && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Only Admin or Finance roles can create subscriptions.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !canManage}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteSub(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Subscriptions;
