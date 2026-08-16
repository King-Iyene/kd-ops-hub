import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, GraduationCap,
  Award, AlertTriangle, CheckCircle2, Clock, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO, differenceInDays } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';

const CATEGORIES = ['professional_development','compliance','safety','technical','leadership','software','other'] as const;
type TrainingCategory = typeof CATEGORIES[number];

const CATEGORY_LABEL: Record<TrainingCategory, string> = {
  professional_development: 'Professional Development',
  compliance: 'Compliance', safety: 'Safety', technical: 'Technical',
  leadership: 'Leadership', software: 'Software', other: 'Other',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default'|'secondary'|'destructive'|'outline' }> = {
  completed:   { label: 'Completed',   variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'outline' },
  expired:     { label: 'Expired',     variant: 'destructive' },
  pending:     { label: 'Pending',     variant: 'secondary' },
};

interface TrainingRecord {
  id: string;
  employee_id: string;
  record_type: 'training' | 'certification';
  title: string;
  provider: string | null;
  category: TrainingCategory;
  is_mandatory: boolean;
  start_date: string;
  completion_date: string | null;
  expiry_date: string | null;
  score: string | null;
  certificate_url: string | null;
  cost_ngn: number | null;
  duration_hours: number | null;
  status: 'completed' | 'in_progress' | 'expired' | 'pending';
  notes: string | null;
  created_at: string;
}

interface Profile { id: string; full_name: string; }

function effectiveStatus(r: TrainingRecord): TrainingRecord['status'] {
  if (r.record_type === 'certification' && r.expiry_date && parseISO(r.expiry_date) < new Date()) return 'expired';
  return r.status;
}

function expiryBadge(expiry: string | null) {
  if (!expiry) return null;
  const days = differenceInDays(parseISO(expiry), new Date());
  if (days < 0)   return <Badge variant="destructive" className="text-[10px]">Expired</Badge>;
  if (days <= 30) return <Badge variant="outline" className="text-[10px] border-warning text-warning">Expires in {days}d</Badge>;
  return null;
}

const EMPTY_FORM = {
  employee_id: '__none__', record_type: 'training' as 'training'|'certification',
  title: '', provider: '', category: 'professional_development' as TrainingCategory,
  is_mandatory: false, start_date: '', completion_date: '', expiry_date: '',
  score: '', cost_ngn: '', duration_hours: '', status: 'completed' as TrainingRecord['status'], notes: '',
};

export default function Training() {
  usePageTitle('Training & Certifications');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingRecord | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rData }, { data: pData }] = await Promise.all([
      supabase.from('training_records').select('*').order('start_date', { ascending: false }).limit(500),
      supabase.from('profiles_directory').select('id, full_name').neq('is_anonymised', true).limit(200),
    ]);
    setRecords((rData as TrainingRecord[]) || []);
    setProfiles((pData as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? 'Unknown';

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, start_date: format(new Date(), 'yyyy-MM-dd'), completion_date: format(new Date(), 'yyyy-MM-dd') });
    setDialogOpen(true);
  };

  const openEdit = (r: TrainingRecord) => {
    setEditing(r);
    setForm({
      employee_id: r.employee_id, record_type: r.record_type, title: r.title,
      provider: r.provider ?? '', category: r.category, is_mandatory: r.is_mandatory,
      start_date: r.start_date, completion_date: r.completion_date ?? '',
      expiry_date: r.expiry_date ?? '', score: r.score ?? '',
      cost_ngn: r.cost_ngn != null ? String(r.cost_ngn) : '',
      duration_hours: r.duration_hours != null ? String(r.duration_hours) : '',
      status: r.status, notes: r.notes ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (form.employee_id === '__none__' || !form.title.trim() || !form.start_date) {
      toast({ title: 'Employee, title and start date are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id, record_type: form.record_type,
      title: form.title.trim(), provider: form.provider.trim() || null,
      category: form.category, is_mandatory: form.is_mandatory,
      start_date: form.start_date, completion_date: form.completion_date || null,
      expiry_date: form.expiry_date || null, score: form.score.trim() || null,
      cost_ngn: form.cost_ngn ? Number(form.cost_ngn) : null,
      duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
      status: form.status, notes: form.notes.trim() || null, created_by: profile?.id,
    };
    const { error } = editing
      ? await supabase.from('training_records').update(payload).eq('id', editing.id)
      : await supabase.from('training_records').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Record updated' : 'Record added' });
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('training_records').update({ deleted_at: new Date().toISOString() }).eq('id', deleteTarget.id);
    setDeleting(false);
    toast({ title: 'Record removed' });
    setDeleteTarget(null);
    load();
  };

  const filtered = records.filter(r => {
    const eff = effectiveStatus(r);
    if (typeFilter !== 'all' && r.record_type !== typeFilter) return false;
    if (statusFilter !== 'all' && eff !== statusFilter) return false;
    if (catFilter !== 'all' && r.category !== catFilter) return false;
    if (employeeFilter !== 'all' && r.employee_id !== employeeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || (r.provider ?? '').toLowerCase().includes(q) || nameOf(r.employee_id).toLowerCase().includes(q);
    }
    return true;
  });

  const exportCSV = () => {
    const header = 'Employee,Type,Title,Provider,Category,Mandatory,Start,Completion,Expiry,Score,Status,Cost (₦)';
    const rows = filtered.map(r => [
      nameOf(r.employee_id), r.record_type, r.title, r.provider ?? '', CATEGORY_LABEL[r.category],
      r.is_mandatory ? 'Yes' : 'No', r.start_date, r.completion_date ?? '', r.expiry_date ?? '',
      r.score ?? '', effectiveStatus(r), r.cost_ngn ?? '',
    ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `training-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const expiring = records.filter(r => r.expiry_date && differenceInDays(parseISO(r.expiry_date), new Date()) <= 30 && differenceInDays(parseISO(r.expiry_date), new Date()) >= 0).length;
  const expired = records.filter(r => effectiveStatus(r) === 'expired').length;
  const completed = records.filter(r => effectiveStatus(r) === 'completed').length;
  const mandatory = records.filter(r => r.is_mandatory).length;

  const avgTrainingHours = (() => {
    const withHours = records.filter(r => r.duration_hours != null && r.duration_hours > 0);
    if (withHours.length === 0) return null;
    const uniqueEmployees = new Set(withHours.map(r => r.employee_id));
    const totalHours = withHours.reduce((s, r) => s + Number(r.duration_hours), 0);
    return Math.round((totalHours / uniqueEmployees.size) * 10) / 10;
  })();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Training & Certifications"
        description="Track employee courses, certifications, and expiry dates."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add record</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="kd-stat-grid">
        <StatCard title="Completed" value={completed} icon={CheckCircle2} tone="success" />
        <StatCard title="Mandatory" value={mandatory} icon={Award} tone="primary" />
        <StatCard title="Certs expiring ≤30d" value={expiring} icon={AlertTriangle} tone="warning" />
        <StatCard title="Expired" value={expired} icon={Clock} tone="danger" />
        {avgTrainingHours !== null && (
          <StatCard title="Avg hrs / employee" value={avgTrainingHours} icon={GraduationCap} tone="info" subtitle="ISO 30414" />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10 sm:h-9" placeholder="Search by title, provider, or employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-44 h-10 sm:h-9"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-10 sm:h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="training">Training</SelectItem>
            <SelectItem value="certification">Certification</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-10 sm:h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44 h-10 sm:h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          tone="primary"
          title="No records found"
          description="Add the first training or certification record to start tracking courses and expiry dates."
        />
      ) : (
        <>
        <div className="hidden md:block rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                {['Employee', 'Title / Provider', 'Type', 'Category', 'Dates', 'Score', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map(r => {
                const eff = effectiveStatus(r);
                return (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-3 text-xs font-medium">{nameOf(r.employee_id)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{r.title}</p>
                        {r.is_mandatory && <Badge variant="outline" className="text-[10px]">Mandatory</Badge>}
                      </div>
                      {r.provider && <p className="text-[11px] text-muted-foreground">{r.provider}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {r.record_type === 'certification'
                          ? <><Award className="h-3 w-3" /> Certification</>
                          : <><GraduationCap className="h-3 w-3" /> Training</>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]}</td>
                    <td className="px-3 py-3 space-y-0.5">
                      {r.completion_date && (
                        <p className="text-[11px] text-muted-foreground">
                          Completed: {format(parseISO(r.completion_date), 'd MMM yyyy')}
                        </p>
                      )}
                      {r.expiry_date && (
                        <div className="flex items-center gap-1">
                          <p className="text-[11px] text-muted-foreground">
                            Expires: {format(parseISO(r.expiry_date), 'd MMM yyyy')}
                          </p>
                          {expiryBadge(r.expiry_date)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{r.score ?? '—'}</td>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_BADGE[eff].variant} className="text-[10px]">
                        {STATUS_BADGE[eff].label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — same data, thumb-friendly */}
        <div className="md:hidden space-y-2">
          {filtered.map(r => {
            const eff = effectiveStatus(r);
            return (
              <MobileCard key={r.id}>
                <MobileCardHeader>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <MobileCardTitle>{r.title}</MobileCardTitle>
                      {r.is_mandatory && <Badge variant="outline" className="text-[10px] shrink-0">Mandatory</Badge>}
                    </div>
                    {r.provider && <p className="text-[11px] text-muted-foreground">{r.provider}</p>}
                  </div>
                  <MobileCardMeta>
                    <Badge variant={STATUS_BADGE[eff].variant} className="text-[10px]">
                      {STATUS_BADGE[eff].label}
                    </Badge>
                  </MobileCardMeta>
                </MobileCardHeader>

                <MobileCardRow label="Employee">{nameOf(r.employee_id)}</MobileCardRow>
                <MobileCardRow label="Type">
                  <span className="inline-flex items-center gap-1">
                    {r.record_type === 'certification'
                      ? <><Award className="h-3 w-3" /> Certification</>
                      : <><GraduationCap className="h-3 w-3" /> Training</>}
                  </span>
                </MobileCardRow>
                <MobileCardRow label="Category">{CATEGORY_LABEL[r.category]}</MobileCardRow>
                {r.completion_date && (
                  <MobileCardRow label="Completed">{format(parseISO(r.completion_date), 'd MMM yyyy')}</MobileCardRow>
                )}
                {r.expiry_date && (
                  <MobileCardRow label="Expires">
                    <span className="inline-flex items-center gap-1.5">
                      {format(parseISO(r.expiry_date), 'd MMM yyyy')}
                      {expiryBadge(r.expiry_date)}
                    </span>
                  </MobileCardRow>
                )}
                <MobileCardRow label="Score">{r.score ?? '—'}</MobileCardRow>

                <MobileCardFooter>
                  <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4 mr-1.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                  </Button>
                </MobileCardFooter>
              </MobileCard>
            );
          })}
        </div>
        </>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Record' : 'Add Training / Certification'}</DialogTitle>
            <DialogDescription>Set expiry date for certifications to receive renewal alerts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select employee</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.record_type} onValueChange={v => setForm(p => ({ ...p, record_type: v as 'training'|'certification' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="certification">Certification</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v as TrainingCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. PMP Certification, Fire Safety Training" />
            </div>
            <div className="space-y-1.5">
              <Label>Provider / Institution</Label>
              <Input value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} placeholder="e.g. CIPM, Coursera, PMI" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date *</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Completion date</Label>
                <Input type="date" value={form.completion_date} onChange={e => setForm(p => ({ ...p, completion_date: e.target.value }))} />
              </div>
              {form.record_type === 'certification' && (
                <div className="space-y-1.5">
                  <Label>Expiry date</Label>
                  <Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Score / Grade</Label>
                <Input value={form.score} onChange={e => setForm(p => ({ ...p, score: e.target.value }))} placeholder="e.g. 87%, Pass, Distinction" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Cost (₦)</Label>
                <Input type="number" min={0} value={form.cost_ngn} onChange={e => setForm(p => ({ ...p, cost_ngn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (hrs)</Label>
                <Input type="number" min={0} step={0.5} value={form.duration_hours} onChange={e => setForm(p => ({ ...p, duration_hours: e.target.value }))} placeholder="e.g. 8" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as TrainingRecord['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Mandatory</p>
                <p className="text-xs text-muted-foreground">Required for the employee's role (safety, compliance, etc.)</p>
              </div>
              <Switch checked={form.is_mandatory} onCheckedChange={v => setForm(p => ({ ...p, is_mandatory: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Add record'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this record?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.title} for {deleteTarget ? nameOf(deleteTarget.employee_id) : ''} will be hidden from all lists.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
