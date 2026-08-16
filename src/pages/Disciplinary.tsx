import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, ShieldAlert,
  CheckCircle2, ChevronDown, ChevronUp, MessageSquare,
  FileWarning, Gavel, Ban,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
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

type IncidentType = 'verbal_warning' | 'written_warning' | 'final_warning' | 'query' | 'suspension' | 'termination' | 'counselling' | 'other';

const TYPE_CONFIG: Record<IncidentType, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  verbal_warning:  { label: 'Verbal Warning',  variant: 'secondary' },
  written_warning: { label: 'Written Warning', variant: 'outline' },
  final_warning:   { label: 'Final Warning',   variant: 'outline' },
  query:           { label: 'Query / Show Cause', variant: 'outline' },
  suspension:      { label: 'Suspension',      variant: 'destructive' },
  termination:     { label: 'Termination',     variant: 'destructive' },
  counselling:     { label: 'Counselling',     variant: 'secondary' },
  other:           { label: 'Other',           variant: 'secondary' },
};

interface DisciplinaryRecord {
  id: string;
  employee_id: string;
  incident_date: string;
  incident_type: IncidentType;
  subject: string;
  description: string | null;
  outcome: string | null;
  suspension_days: number | null;
  issued_by: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  is_expunged: boolean;
  expunged_at: string | null;
  expunge_reason: string | null;
  created_at: string;
}

interface DisciplinaryResponse {
  id: string;
  record_id: string;
  response_text: string;
  responded_by: string | null;
  responded_at: string;
}

interface Profile { id: string; full_name: string; }

const EMPTY_FORM = {
  employee_id: '__none__',
  incident_date: format(new Date(), 'yyyy-MM-dd'),
  incident_type: 'written_warning' as IncidentType,
  subject: '',
  description: '',
  outcome: '',
  suspension_days: '',
  issued_by: '__none__',
};

const EMPTY_RESPONSE = { response_text: '' };

export default function Disciplinary() {
  usePageTitle('Disciplinary Records');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [records, setRecords] = useState<DisciplinaryRecord[]>([]);
  const [responses, setResponses] = useState<DisciplinaryResponse[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<IncidentType | 'all'>('all');
  const [empFilter, setEmpFilter] = useState('__none__');
  const [showExpunged, setShowExpunged] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DisciplinaryRecord | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DisciplinaryRecord | null>(null);
  const [expungeTarget, setExpungeTarget] = useState<DisciplinaryRecord | null>(null);
  const [expungeReason, setExpungeReason] = useState('');

  // Response
  const [responseTarget, setResponseTarget] = useState<string | null>(null);
  const [responseForm, setResponseForm] = useState({ ...EMPTY_RESPONSE });
  const [savingResponse, setSavingResponse] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rData }, { data: respData }, { data: pData }] = await Promise.all([
      supabase.from('disciplinary_records').select('*').order('incident_date', { ascending: false }),
      supabase.from('disciplinary_responses').select('*').order('responded_at'),
      supabase.from('profiles_directory').select('id, full_name').neq('is_anonymised', true).order('full_name'),
    ]);
    setRecords(rData ?? []);
    setResponses(respData ?? []);
    setProfiles(pData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(r: DisciplinaryRecord) {
    setEditing(r);
    setForm({
      employee_id: r.employee_id,
      incident_date: r.incident_date,
      incident_type: r.incident_type,
      subject: r.subject,
      description: r.description ?? '',
      outcome: r.outcome ?? '',
      suspension_days: r.suspension_days != null ? String(r.suspension_days) : '',
      issued_by: r.issued_by ?? '__none__',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.employee_id || form.employee_id === '__none__') {
      toast({ title: 'Please select an employee', variant: 'destructive' }); return;
    }
    if (!form.subject.trim()) {
      toast({ title: 'Subject is required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      incident_date: form.incident_date,
      incident_type: form.incident_type,
      subject: form.subject.trim(),
      description: form.description.trim() || null,
      outcome: form.outcome.trim() || null,
      suspension_days: form.suspension_days !== '' ? parseInt(form.suspension_days) : null,
      issued_by: form.issued_by !== '__none__' ? form.issued_by : (user?.id ?? null),
      created_by: user?.id,
    };
    const { error } = editing
      ? await supabase.from('disciplinary_records').update(payload).eq('id', editing.id)
      : await supabase.from('disciplinary_records').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Record updated' : 'Record created' });
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('disciplinary_records').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Record deleted' }); load(); }
    setDeleteTarget(null);
  }

  async function handleAcknowledge(r: DisciplinaryRecord) {
    const { error } = await supabase.from('disciplinary_records').update({
      acknowledged_by: user?.id,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Acknowledged' });
    load();
  }

  async function handleExpunge() {
    if (!expungeTarget) return;
    const { error } = await supabase.from('disciplinary_records').update({
      is_expunged: true,
      expunged_at: new Date().toISOString(),
      expunged_by: user?.id,
      expunge_reason: expungeReason.trim() || null,
    }).eq('id', expungeTarget.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Record expunged from employee history' }); load(); }
    setExpungeTarget(null);
    setExpungeReason('');
  }

  async function handleAddResponse(recordId: string) {
    if (!responseForm.response_text.trim()) return;
    setSavingResponse(true);
    const { error } = await supabase.from('disciplinary_responses').insert({
      record_id: recordId,
      response_text: responseForm.response_text.trim(),
      responded_by: user?.id,
    });
    setSavingResponse(false);
    if (error) { toast({ title: 'Failed to save response', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Response recorded' });
    setResponseTarget(null);
    setResponseForm({ ...EMPTY_RESPONSE });
    load();
  }

  const filtered = records.filter(r => {
    const emp = profiles.find(p => p.id === r.employee_id);
    const term = search.toLowerCase();
    const matchSearch = !term ||
      r.subject.toLowerCase().includes(term) ||
      (emp?.full_name ?? '').toLowerCase().includes(term);
    const matchType = typeFilter === 'all' || r.incident_type === typeFilter;
    const matchEmp = empFilter === '__none__' || r.employee_id === empFilter;
    const matchExpunged = showExpunged || !r.is_expunged;
    return matchSearch && matchType && matchEmp && matchExpunged;
  });

  function exportCSV() {
    const rows = filtered.map(r => {
      const emp = profiles.find(p => p.id === r.employee_id);
      return [
        emp?.full_name ?? r.employee_id,
        r.incident_date,
        TYPE_CONFIG[r.incident_type].label,
        r.subject,
        r.outcome ?? '',
        r.is_expunged ? 'Yes' : 'No',
        r.acknowledged_at ? 'Yes' : 'No',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = ['Employee,Date,Type,Subject,Outcome,Expunged,Acknowledged', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'disciplinary.csv'; a.click();
  }

  const empName = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : '—';

  const activeCount = records.filter(r => !r.is_expunged).length;
  const queriesCount = records.filter(r => r.incident_type === 'query' && !r.is_expunged).length;
  const suspendedCount = records.filter(r => r.incident_type === 'suspension' && !r.is_expunged).length;
  const unacknowledgedCount = records.filter(r => !r.acknowledged_at && !r.is_expunged).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disciplinary Records"
        description="Warning letters, queries, suspensions and formal actions"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Record
          </Button>
        }
      />

      {/* Summary */}
      <div className="kd-stat-grid">
        {([
          { label: 'Active Records', value: activeCount, icon: FileWarning, tone: 'default' },
          { label: 'Open Queries', value: queriesCount, icon: Gavel, tone: 'warning' },
          { label: 'Suspensions', value: suspendedCount, icon: Ban, tone: 'danger' },
          { label: 'Unacknowledged', value: unacknowledgedCount, icon: ShieldAlert, tone: 'primary' },
        ] as { label: string; value: number; icon: typeof FileWarning; tone: 'default' | 'warning' | 'danger' | 'primary' }[]).map(({ label, value, icon, tone }) => (
          <StatCard key={label} title={label} value={value} icon={icon} tone={tone} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search employee, subject…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as IncidentType | 'all')}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TYPE_CONFIG) as IncidentType[]).map(t => (
              <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All Employees</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showExpunged} onChange={e => setShowExpunged(e.target.checked)} className="h-4 w-4" />
          Show expunged
        </label>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Records */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No disciplinary records found"
          description="Formal warnings, queries and suspensions will appear here once recorded."
          action={
            <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> New Record</Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const cfg = TYPE_CONFIG[r.incident_type];
            const isExpanded = !!expanded[r.id];
            const recordResponses = responses.filter(rs => rs.record_id === r.id);

            return (
              <Card key={r.id} className={r.is_expunged ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-sm font-semibold">{r.subject}</CardTitle>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {r.is_expunged && <Badge variant="outline">Expunged</Badge>}
                        {!r.acknowledged_at && !r.is_expunged && (
                          <Badge variant="secondary">Unacknowledged</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground mt-1">
                        <span><strong>{empName(r.employee_id)}</strong></span>
                        <span>{format(parseISO(r.incident_date), 'dd MMM yyyy')}</span>
                        {r.issued_by && <span>Issued by: {empName(r.issued_by)}</span>}
                        {r.suspension_days && <span>Suspension: {r.suspension_days} day{r.suspension_days !== 1 ? 's' : ''}</span>}
                        {r.acknowledged_at && <span className="text-success font-medium">Acknowledged {format(parseISO(r.acknowledged_at), 'dd MMM')}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit record"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} aria-label="Delete record"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))} aria-label={isExpanded ? 'Collapse record' : 'Expand record'}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-4">
                    {r.description && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Details</p>
                        <p className="text-sm whitespace-pre-wrap">{r.description}</p>
                      </div>
                    )}
                    {r.outcome && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Outcome</p>
                        <p className="text-sm">{r.outcome}</p>
                      </div>
                    )}
                    {r.is_expunged && r.expunge_reason && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Expunge Reason</p>
                        <p className="text-sm">{r.expunge_reason}</p>
                      </div>
                    )}

                    {/* Responses */}
                    {recordResponses.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          <MessageSquare className="h-3 w-3 inline mr-1" />Employee Responses
                        </p>
                        <div className="space-y-2">
                          {recordResponses.map(rs => (
                            <div key={rs.id} className="bg-muted/40 rounded-lg p-3">
                              <p className="text-sm">{rs.response_text}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {empName(rs.responded_by)} · {format(parseISO(rs.responded_at), 'dd MMM yyyy HH:mm')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {!r.acknowledged_at && !r.is_expunged && (
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => handleAcknowledge(r)}>
                          <CheckCircle2 className="h-3 w-3" /> Mark Acknowledged
                        </Button>
                      )}
                      {!r.is_expunged && (
                        <>
                          {responseTarget === r.id ? (
                            <div className="flex-1 space-y-2">
                              <Textarea
                                rows={2}
                                placeholder="Employee response text…"
                                value={responseForm.response_text}
                                onChange={e => setResponseForm({ response_text: e.target.value })}
                              />
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setResponseTarget(null)}>Cancel</Button>
                                <Button size="sm" onClick={() => handleAddResponse(r.id)} disabled={savingResponse || !responseForm.response_text.trim()}>
                                  {savingResponse ? 'Saving…' : 'Save Response'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="gap-2" onClick={() => { setResponseTarget(r.id); setResponseForm({ ...EMPTY_RESPONSE }); }}>
                              <MessageSquare className="h-3 w-3" /> Add Response
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => { setExpungeTarget(r); setExpungeReason(''); }}>
                            Expunge Record
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Record' : 'New Disciplinary Record'}</DialogTitle>
            <DialogDescription>Formal disciplinary action per Nigerian Labour Act</DialogDescription>
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
                <Label className="kd-label">Incident Date</Label>
                <Input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Action Type</Label>
                <Select value={form.incident_type} onValueChange={v => setForm(f => ({ ...f, incident_type: v as IncidentType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_CONFIG) as IncidentType[]).map(t => (
                      <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Subject *</Label>
              <Input placeholder="e.g. Unauthorised absence — 14 April 2026" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Description / Incident Details</Label>
              <Textarea rows={4} placeholder="Full description of the incident, evidence, timeline…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Outcome / Decision</Label>
              <Textarea rows={2} placeholder="Formal outcome, action taken…" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} />
            </div>
            {form.incident_type === 'suspension' && (
              <div className="space-y-1">
                <Label className="kd-label">Suspension Days</Label>
                <Input type="number" min="1" placeholder="Number of days" value={form.suspension_days} onChange={e => setForm(f => ({ ...f, suspension_days: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="kd-label">Issued By</Label>
              <Select value={form.issued_by} onValueChange={v => setForm(f => ({ ...f, issued_by: v }))}>
                <SelectTrigger><SelectValue placeholder="Select issuer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Current user —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Record'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete disciplinary record?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.subject}" will be permanently deleted. Use "Expunge" instead to keep the record but clear it from the employee's active history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expunge confirmation */}
      <AlertDialog open={!!expungeTarget} onOpenChange={o => !o && setExpungeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Expunge this record?</AlertDialogTitle>
            <AlertDialogDescription>
              The record will be marked as expunged and hidden from active history. It remains in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label className="text-sm">Reason for expunging</Label>
            <Textarea
              rows={2}
              className="mt-1"
              placeholder="e.g. Employee completed 12 months clean record period"
              value={expungeReason}
              onChange={e => setExpungeReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExpunge}>Expunge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
