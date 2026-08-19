import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Eye, Pencil, Trash2,
  ShieldAlert, AlertTriangle, Scale, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { toCsv, downloadCsv } from '@/lib/csv';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type Category = 'harassment' | 'discrimination' | 'safety' | 'pay_dispute' | 'management' | 'policy_violation' | 'whistleblowing' | 'general';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'open' | 'investigating' | 'resolved' | 'dismissed' | 'escalated';

const CATEGORY_CONFIG: Record<Category, { label: string; className: string }> = {
  harassment:       { label: 'Harassment',        className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' },
  discrimination:   { label: 'Discrimination',    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
  safety:           { label: 'Safety',             className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' },
  pay_dispute:      { label: 'Pay Dispute',        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  management:       { label: 'Management',         className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  policy_violation: { label: 'Policy Violation',   className: 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-800' },
  whistleblowing:   { label: 'Whistleblowing',     className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  general:          { label: 'General',            className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300 border-gray-200 dark:border-gray-800' },
};

const SEVERITY_CONFIG: Record<Severity, { label: string; variant: 'secondary' | 'outline' | 'destructive'; className?: string }> = {
  low:      { label: 'Low',      variant: 'secondary' },
  medium:   { label: 'Medium',   variant: 'outline' },
  high:     { label: 'High',     variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' },
  critical: { label: 'Critical', variant: 'destructive' },
};

const STATUS_CONFIG: Record<Status, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
  open:          { label: 'Open',          variant: 'default' },
  investigating: { label: 'Investigating', variant: 'outline', className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' },
  resolved:      { label: 'Resolved',      variant: 'outline', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700' },
  dismissed:     { label: 'Dismissed',     variant: 'secondary' },
  escalated:     { label: 'Escalated',     variant: 'destructive' },
};

interface Grievance {
  id: string;
  subject: string;
  description: string;
  category: Category;
  severity: Severity;
  is_anonymous: boolean;
  reporter_id: string | null;
  assigned_to: string | null;
  status: Status;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile { id: string; full_name: string; }

const EMPTY_FORM = {
  subject: '',
  description: '',
  category: 'general' as Category,
  severity: 'medium' as Severity,
  is_anonymous: false,
};

export default function Grievances() {
  usePageTitle('Grievances');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [viewTarget, setViewTarget] = useState<Grievance | null>(null);
  const [updateStatus, setUpdateStatus] = useState<Status>('open');
  const [updateAssignedTo, setUpdateAssignedTo] = useState('__none__');
  const [updateResolutionNotes, setUpdateResolutionNotes] = useState('');
  const [updatingSaving, setUpdatingSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Grievance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: gData }, { data: pData }] = await Promise.all([
      supabase.from('grievances').select('id, subject, description, category, severity, is_anonymous, reporter_id, assigned_to, status, resolution_notes, resolved_at, created_at').order('created_at', { ascending: false }).limit(5000),
      supabase.from('profiles_directory').select('id, full_name').neq('is_anonymised', true).order('full_name'),
    ]);
    setGrievances(gData ?? []);
    setProfiles(pData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const profileName = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : '—';

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setCreateOpen(true);
  }

  function openView(g: Grievance) {
    setViewTarget(g);
    setUpdateStatus(g.status);
    setUpdateAssignedTo(g.assigned_to ?? '__none__');
    setUpdateResolutionNotes(g.resolution_notes ?? '');
  }

  async function handleCreate() {
    if (!form.subject.trim()) {
      toast({ title: 'Subject is required', variant: 'destructive' }); return;
    }
    if (!form.description.trim()) {
      toast({ title: 'Description is required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      subject: form.subject.trim(),
      description: form.description.trim(),
      category: form.category,
      severity: form.severity,
      is_anonymous: form.is_anonymous,
      reporter_id: form.is_anonymous ? null : (user?.id ?? null),
      status: 'open' as Status,
    };
    const { error } = await supabase.from('grievances').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Failed to submit grievance', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Grievance submitted' });
    setCreateOpen(false);
    load();
  }

  async function handleUpdate() {
    if (!viewTarget) return;
    setUpdatingSaving(true);
    const payload: Record<string, unknown> = {
      status: updateStatus,
      assigned_to: updateAssignedTo !== '__none__' ? updateAssignedTo : null,
      resolution_notes: updateResolutionNotes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (updateStatus === 'resolved' && viewTarget.status !== 'resolved') {
      payload.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('grievances').update(payload).eq('id', viewTarget.id);
    setUpdatingSaving(false);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Grievance updated' });
    setViewTarget(null);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('grievances').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Grievance deleted' }); load(); }
    setDeleteTarget(null);
  }

  const filtered = grievances.filter(g => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      g.subject.toLowerCase().includes(term) ||
      g.description.toLowerCase().includes(term);
    const matchCategory = categoryFilter === 'all' || g.category === categoryFilter;
    const matchStatus = statusFilter === 'all' || g.status === statusFilter;
    const matchSeverity = severityFilter === 'all' || g.severity === severityFilter;
    return matchSearch && matchCategory && matchStatus && matchSeverity;
  });

  function exportCSV() {
    const header = ['Subject', 'Category', 'Severity', 'Status', 'Reporter', 'Assigned To', 'Created', 'Resolution Notes'];
    const rows = filtered.map(g => [
      g.subject,
      CATEGORY_CONFIG[g.category].label,
      SEVERITY_CONFIG[g.severity].label,
      STATUS_CONFIG[g.status].label,
      g.is_anonymous ? 'Anonymous' : profileName(g.reporter_id),
      profileName(g.assigned_to),
      format(parseISO(g.created_at), 'yyyy-MM-dd'),
      g.resolution_notes ?? '',
    ]);
    downloadCsv('grievances.csv', toCsv(header, rows));
  }

  const totalCount = grievances.length;
  const openCount = grievances.filter(g => g.status === 'open').length;
  const investigatingCount = grievances.filter(g => g.status === 'investigating').length;
  const resolvedCount = grievances.filter(g => g.status === 'resolved').length;
  const criticalCount = grievances.filter(g => g.severity === 'critical').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grievance Portal"
        description="Confidential reporting channel for workplace grievances and whistleblowing"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Report Grievance
          </Button>
        }
      />

      <div className="kd-stat-grid">
        {([
          { label: 'Total Cases',    value: totalCount,          icon: FileText,      tone: 'default' },
          { label: 'Open',           value: openCount,           icon: AlertTriangle, tone: 'warning' },
          { label: 'Investigating',  value: investigatingCount,  icon: Search,        tone: 'primary' },
          { label: 'Resolved',       value: resolvedCount,       icon: Scale,         tone: 'success' },
          { label: 'Critical',       value: criticalCount,       icon: ShieldAlert,   tone: 'danger' },
        ] as { label: string; value: number; icon: typeof FileText; tone: 'default' | 'warning' | 'primary' | 'success' | 'danger' }[]).map(({ label, value, icon, tone }) => (
          <StatCard key={label} title={label} value={value} icon={icon} tone={tone} />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search subject, description..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as Category | 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(CATEGORY_CONFIG) as Category[]).map(c => (
              <SelectItem key={c} value={c}>{CATEGORY_CONFIG[c].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as Status | 'all')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={v => setSeverityFilter(v as Severity | 'all')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            {(Object.keys(SEVERITY_CONFIG) as Severity[]).map(s => (
              <SelectItem key={s} value={s}>{SEVERITY_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No grievances found"
          description="Workplace grievances and whistleblowing reports will appear here once submitted."
          action={
            <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Report Grievance</Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Subject</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Severity</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Reporter</th>
                    <th className="text-left p-3 font-medium">Assigned To</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(g => {
                    const catCfg = CATEGORY_CONFIG[g.category];
                    const sevCfg = SEVERITY_CONFIG[g.severity];
                    const stsCfg = STATUS_CONFIG[g.status];
                    return (
                      <tr key={g.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium max-w-[250px] truncate">{g.subject}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${catCfg.className}`}>
                            {catCfg.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge variant={sevCfg.variant} className={sevCfg.className}>{sevCfg.label}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant={stsCfg.variant} className={stsCfg.className}>{stsCfg.label}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {g.is_anonymous ? 'Anonymous' : profileName(g.reporter_id)}
                        </td>
                        <td className="p-3 text-muted-foreground">{profileName(g.assigned_to)}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {format(parseISO(g.created_at), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openView(g)} aria-label="View grievance">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(g)} aria-label="Delete grievance">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report a Grievance</DialogTitle>
            <DialogDescription>All submissions are treated confidentially. You may report anonymously.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="kd-label">Subject *</Label>
              <Input placeholder="Brief summary of the grievance" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Description *</Label>
              <Textarea rows={5} placeholder="Provide as much detail as possible including dates, people involved, and any evidence..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as Category }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_CONFIG) as Category[]).map(c => (
                      <SelectItem key={c} value={c}>{CATEGORY_CONFIG[c].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v as Severity }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SEVERITY_CONFIG) as Severity[]).map(s => (
                      <SelectItem key={s} value={s}>{SEVERITY_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))} className="h-4 w-4" />
              Submit anonymously
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Submitting...' : 'Submit Grievance'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / Update dialog */}
      <Dialog open={!!viewTarget} onOpenChange={o => !o && setViewTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewTarget?.subject}</DialogTitle>
            <DialogDescription>Grievance details and case management</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-5 py-2">
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_CONFIG[viewTarget.category].className}`}>
                  {CATEGORY_CONFIG[viewTarget.category].label}
                </span>
                <Badge variant={SEVERITY_CONFIG[viewTarget.severity].variant} className={SEVERITY_CONFIG[viewTarget.severity].className}>
                  {SEVERITY_CONFIG[viewTarget.severity].label}
                </Badge>
                <Badge variant={STATUS_CONFIG[viewTarget.status].variant} className={STATUS_CONFIG[viewTarget.status].className}>
                  {STATUS_CONFIG[viewTarget.status].label}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>Reporter: <strong>{viewTarget.is_anonymous ? 'Anonymous' : profileName(viewTarget.reporter_id)}</strong></span>
                <span>Assigned: <strong>{profileName(viewTarget.assigned_to)}</strong></span>
                <span>Filed: <strong>{format(parseISO(viewTarget.created_at), 'dd MMM yyyy HH:mm')}</strong></span>
                {viewTarget.resolved_at && (
                  <span>Resolved: <strong>{format(parseISO(viewTarget.resolved_at), 'dd MMM yyyy HH:mm')}</strong></span>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{viewTarget.description}</p>
              </div>

              {viewTarget.resolution_notes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Resolution Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{viewTarget.resolution_notes}</p>
                </div>
              )}

              <hr />

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Case</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="kd-label">Status</Label>
                  <Select value={updateStatus} onValueChange={v => setUpdateStatus(v as Status)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="kd-label">Assign To</Label>
                  <Select value={updateAssignedTo} onValueChange={setUpdateAssignedTo}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Resolution Notes</Label>
                <Textarea
                  rows={3}
                  placeholder="Findings, actions taken, outcome..."
                  value={updateResolutionNotes}
                  onChange={e => setUpdateResolutionNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
            <Button onClick={handleUpdate} disabled={updatingSaving}>{updatingSaving ? 'Saving...' : 'Update Case'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this grievance?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.subject}" will be permanently deleted. This action cannot be undone.
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
