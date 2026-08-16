import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, HeartPulse,
  AlertTriangle, CheckCircle2, Clock, Shield,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO, differenceInDays } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type BenefitType = 'hmo' | 'pension_pfa' | 'group_life' | 'dental' | 'vision' | 'life_insurance' | 'other';
type BenefitFreq = 'monthly' | 'quarterly' | 'annually';
type BenefitStatus = 'active' | 'suspended' | 'expired';

const TYPE_LABEL: Record<BenefitType, string> = {
  hmo: 'HMO (Health)',
  pension_pfa: 'Pension (PFA)',
  group_life: 'Group Life',
  dental: 'Dental',
  vision: 'Vision',
  life_insurance: 'Life Insurance',
  other: 'Other',
};

const TYPE_ICON: Record<BenefitType, React.ElementType> = {
  hmo: HeartPulse,
  pension_pfa: Shield,
  group_life: Shield,
  dental: HeartPulse,
  vision: HeartPulse,
  life_insurance: Shield,
  other: CheckCircle2,
};

const FREQ_LABEL: Record<BenefitFreq, string> = {
  monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually',
};

const STATUS_BADGE: Record<BenefitStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active:    { label: 'Active',    variant: 'default' },
  suspended: { label: 'Suspended', variant: 'secondary' },
  expired:   { label: 'Expired',   variant: 'destructive' },
};

interface EmployeeBenefit {
  id: string;
  employee_id: string;
  benefit_type: BenefitType;
  provider: string;
  plan_name: string | null;
  policy_number: string | null;
  pfa_rsa_pin: string | null;
  premium_ngn: number | null;
  premium_frequency: BenefitFreq;
  enrollment_date: string | null;
  expiry_date: string | null;
  status: BenefitStatus;
  notes: string | null;
  created_at: string;
}

interface Profile { id: string; full_name: string; }

const EMPTY_FORM = {
  employee_id: '__none__',
  benefit_type: 'hmo' as BenefitType,
  provider: '',
  plan_name: '',
  policy_number: '',
  pfa_rsa_pin: '',
  premium_ngn: '',
  premium_frequency: 'monthly' as BenefitFreq,
  enrollment_date: '',
  expiry_date: '',
  status: 'active' as BenefitStatus,
  notes: '',
};

function monthlyEquivalent(premium: number, freq: BenefitFreq): number {
  if (freq === 'monthly') return premium;
  if (freq === 'quarterly') return premium / 3;
  return premium / 12;
}

export default function Benefits() {
  usePageTitle('Employee Benefits');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [benefits, setBenefits] = useState<EmployeeBenefit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<BenefitType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BenefitStatus | 'all'>('all');
  const [empFilter, setEmpFilter] = useState('__none__');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeBenefit | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeBenefit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: bData }, { data: pData }] = await Promise.all([
      supabase.from('employee_benefits').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles_directory').select('id, full_name').neq('is_anonymised', true).order('full_name'),
    ]);
    setBenefits(bData ?? []);
    setProfiles(pData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(b: EmployeeBenefit) {
    setEditing(b);
    setForm({
      employee_id: b.employee_id,
      benefit_type: b.benefit_type,
      provider: b.provider,
      plan_name: b.plan_name ?? '',
      policy_number: b.policy_number ?? '',
      pfa_rsa_pin: b.pfa_rsa_pin ?? '',
      premium_ngn: b.premium_ngn != null ? String(b.premium_ngn) : '',
      premium_frequency: b.premium_frequency,
      enrollment_date: b.enrollment_date ?? '',
      expiry_date: b.expiry_date ?? '',
      status: b.status,
      notes: b.notes ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.provider.trim()) {
      toast({ title: 'Provider is required', variant: 'destructive' }); return;
    }
    if (!form.employee_id || form.employee_id === '__none__') {
      toast({ title: 'Please select an employee', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      benefit_type: form.benefit_type,
      provider: form.provider.trim(),
      plan_name: form.plan_name.trim() || null,
      policy_number: form.policy_number.trim() || null,
      pfa_rsa_pin: form.pfa_rsa_pin.trim() || null,
      premium_ngn: form.premium_ngn !== '' ? parseFloat(form.premium_ngn) : null,
      premium_frequency: form.premium_frequency,
      enrollment_date: form.enrollment_date || null,
      expiry_date: form.expiry_date || null,
      status: form.status,
      notes: form.notes.trim() || null,
      created_by: user?.id,
    };
    const { error } = editing
      ? await supabase.from('employee_benefits').update(payload).eq('id', editing.id)
      : await supabase.from('employee_benefits').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Benefit updated' : 'Benefit added' });
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('employee_benefits').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Benefit deleted' }); load(); }
    setDeleteTarget(null);
  }

  const filtered = benefits.filter(b => {
    const emp = profiles.find(p => p.id === b.employee_id);
    const term = search.toLowerCase();
    const matchSearch = !term ||
      b.provider.toLowerCase().includes(term) ||
      (b.plan_name ?? '').toLowerCase().includes(term) ||
      (b.policy_number ?? '').toLowerCase().includes(term) ||
      (emp?.full_name ?? '').toLowerCase().includes(term);
    const matchType = typeFilter === 'all' || b.benefit_type === typeFilter;
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchEmp = empFilter === '__none__' || b.employee_id === empFilter;
    return matchSearch && matchType && matchStatus && matchEmp;
  });

  function exportCSV() {
    const rows = filtered.map(b => {
      const emp = profiles.find(p => p.id === b.employee_id);
      return [
        emp?.full_name ?? b.employee_id,
        TYPE_LABEL[b.benefit_type],
        b.provider,
        b.plan_name ?? '',
        b.policy_number ?? '',
        b.pfa_rsa_pin ?? '',
        b.premium_ngn != null ? b.premium_ngn : '',
        FREQ_LABEL[b.premium_frequency],
        b.enrollment_date ?? '',
        b.expiry_date ?? '',
        b.status,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = ['Employee,Type,Provider,Plan,Policy No,RSA PIN,Premium (₦),Frequency,Enrolled,Expires,Status', ...rows].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'benefits.csv'; a.click();
  }

  function expiryBadge(expiry: string | null) {
    if (!expiry) return null;
    const days = differenceInDays(parseISO(expiry), new Date());
    if (days < 0) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Expired</Badge>;
    if (days <= 30) return <Badge variant="outline" className="gap-1 border-warning/50 text-warning"><Clock className="h-3 w-3" /> Expires in {days}d</Badge>;
    return null;
  }

  const empName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Benefits"
        description="HMO, pension, group life and other statutory benefits"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Add Benefit
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search provider, plan, employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as BenefitType | 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TYPE_LABEL) as BenefitType[]).map(t => (
              <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as BenefitStatus | 'all')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All Employees</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Summary cards */}
      <div className="kd-stat-grid">
        {(['hmo', 'pension_pfa', 'group_life', 'dental', 'vision', 'life_insurance', 'other'] as BenefitType[]).map((t) => {
          const active = benefits.filter(b => b.benefit_type === t && b.status === 'active').length;
          if (active === 0 && !['hmo', 'pension_pfa', 'group_life'].includes(t)) return null;
          const Icon = TYPE_ICON[t];
          return (
            <StatCard
              key={t}
              title={TYPE_LABEL[t]}
              value={active}
              subtitle="active enrolments"
              icon={Icon as any}
              tone={t === 'hmo' ? 'success' : t === 'pension_pfa' ? 'primary' : 'default'}
            />
          );
        })}
        <StatCard
          title="Total Monthly Cost"
          value={`₦${Math.round(benefits.filter(b => b.status === 'active' && b.premium_ngn != null).reduce((s, b) => s + monthlyEquivalent(b.premium_ngn!, b.premium_frequency), 0)).toLocaleString('en-NG')}`}
          subtitle="across all active plans"
          icon={Shield as any}
          tone="default"
        />
      </div>

      {/* List */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No benefit records found"
          description="Enrol employees in HMO, pension, group life or other benefits to track them here."
          action={
            <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Add Benefit</Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(b => {
            const Icon = TYPE_ICON[b.benefit_type];
            const sb = STATUS_BADGE[b.status];
            const monthly = b.premium_ngn != null ? monthlyEquivalent(b.premium_ngn, b.premium_frequency) : null;
            return (
              <Card key={b.id} className="relative">
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-medium text-sm leading-tight">{b.provider}</p>
                        <p className="text-xs text-muted-foreground">{TYPE_LABEL[b.benefit_type]}{b.plan_name ? ` — ${b.plan_name}` : ''}</p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb.label}</Badge>
                  </div>

                  <p className="text-sm font-medium">{empName(b.employee_id)}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {b.policy_number && <span>Policy: {b.policy_number}</span>}
                    {b.pfa_rsa_pin && <span>RSA: {b.pfa_rsa_pin}</span>}
                    {monthly != null && (
                      <span>₦{monthly.toLocaleString('en-NG', { maximumFractionDigits: 0 })}/mo equiv</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {b.enrollment_date && <span>Enrolled: {format(parseISO(b.enrollment_date), 'dd MMM yyyy')}</span>}
                    {b.expiry_date && <span>Expires: {format(parseISO(b.expiry_date), 'dd MMM yyyy')}</span>}
                  </div>

                  {expiryBadge(b.expiry_date)}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)} aria-label="Edit benefit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(b)} aria-label="Delete benefit">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Benefit' : 'Add Employee Benefit'}</DialogTitle>
            <DialogDescription>HMO, pension, group life or other benefit</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="kd-label">Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select employee —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Benefit Type *</Label>
                <Select value={form.benefit_type} onValueChange={v => setForm(f => ({ ...f, benefit_type: v as BenefitType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as BenefitType[]).map(t => (
                      <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as BenefitStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="kd-label">Provider *</Label>
              <Input placeholder="e.g. Hygeia HMO, ARM Pension" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Plan Name</Label>
                <Input placeholder="e.g. Executive Plan" value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Policy Number</Label>
                <Input placeholder="Policy / member ID" value={form.policy_number} onChange={e => setForm(f => ({ ...f, policy_number: e.target.value }))} />
              </div>
            </div>

            {form.benefit_type === 'pension_pfa' && (
              <div className="space-y-1">
                <Label className="kd-label">RSA PIN (PFA)</Label>
                <Input placeholder="Retirement Savings Account PIN" value={form.pfa_rsa_pin} onChange={e => setForm(f => ({ ...f, pfa_rsa_pin: e.target.value }))} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Premium (₦)</Label>
                <Input type="number" min="0" placeholder="0.00" value={form.premium_ngn} onChange={e => setForm(f => ({ ...f, premium_ngn: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Frequency</Label>
                <Select value={form.premium_frequency} onValueChange={v => setForm(f => ({ ...f, premium_frequency: v as BenefitFreq }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Enrollment Date</Label>
                <Input type="date" value={form.enrollment_date} onChange={e => setForm(f => ({ ...f, enrollment_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Expiry Date</Label>
                <Input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="kd-label">Notes</Label>
              <Textarea rows={3} placeholder="Additional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Benefit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete benefit record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the {deleteTarget ? TYPE_LABEL[deleteTarget.benefit_type] : ''} benefit from {deleteTarget ? empName(deleteTarget.employee_id) : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
