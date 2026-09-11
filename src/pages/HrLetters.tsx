import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Pencil, Trash2, FileText,
  FilePlus, FileCheck, FileX, PenTool,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { SignaturePad } from '@/components/ui-kit/SignaturePad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { useToast } from '@/hooks/use-toast';
import { FieldError, useFieldErrors } from '@/components/ui-kit/FieldError';

type LetterType = 'confirmation' | 'promotion' | 'employment_verification' | 'reference' | 'termination' | 'salary_review' | 'warning' | 'custom';
type LetterStatus = 'draft' | 'issued' | 'revoked';

const TYPE_CONFIG: Record<LetterType, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  confirmation:            { label: 'Confirmation',            variant: 'default' },
  promotion:               { label: 'Promotion',               variant: 'default' },
  employment_verification: { label: 'Employment Verification', variant: 'outline' },
  reference:               { label: 'Reference',               variant: 'outline' },
  termination:             { label: 'Termination',             variant: 'destructive' },
  salary_review:           { label: 'Salary Review',           variant: 'outline' },
  warning:                 { label: 'Warning',                 variant: 'destructive' },
  custom:                  { label: 'Custom',                  variant: 'secondary' },
};

const TYPE_COLOR: Record<LetterType, string> = {
  confirmation:            'bg-primary/10 text-primary',
  promotion:               'bg-success/10 text-success',
  employment_verification: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  reference:               'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  termination:             'bg-destructive/10 text-destructive',
  salary_review:           'bg-warning/10 text-warning',
  warning:                 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  custom:                  'bg-muted text-muted-foreground',
};

const STATUS_CONFIG: Record<LetterStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  draft:   { label: 'Draft',   variant: 'secondary' },
  issued:  { label: 'Issued',  variant: 'default' },
  revoked: { label: 'Revoked', variant: 'destructive' },
};

interface HrLetter {
  id: string;
  employee_id: string;
  letter_type: LetterType;
  title: string;
  body_html: string;
  effective_date: string | null;
  metadata: Record<string, unknown>;
  status: LetterStatus;
  issued_by: string | null;
  issued_at: string | null;
  recipient_signature_url: string | null;
  signed_at: string | null;
  signed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile { id: string; full_name: string; }

const EMPTY_FORM = {
  employee_id: '__none__',
  letter_type: 'confirmation' as LetterType,
  title: '',
  body_html: '',
  effective_date: '',
  status: 'draft' as LetterStatus,
};

export default function HrLetters() {
  usePageTitle('HR Letters');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [letters, setLetters] = useState<HrLetter[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<LetterType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<LetterStatus | 'all'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HrLetter | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrLetter | null>(null);
  const [signingLetter, setSigningLetter] = useState<HrLetter | null>(null);
  const { errors, setError, clearError, clearAll, hasErrors } = useFieldErrors<'employee_id' | 'title' | 'body_html'>();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: lData }, { data: pData }] = await Promise.all([
      supabase.from('hr_letters').select('id, employee_id, letter_type, title, body_html, effective_date, status, recipient_signature_url, created_at').order('created_at', { ascending: false }).limit(5000),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    setLetters(lData ?? []);
    setProfiles(pData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    clearAll();
    setDialogOpen(true);
  }

  function openEdit(letter: HrLetter) {
    setEditing(letter);
    setForm({
      employee_id: letter.employee_id,
      letter_type: letter.letter_type,
      title: letter.title,
      body_html: letter.body_html,
      effective_date: letter.effective_date ?? '',
      status: letter.status,
    });
    clearAll();
    setDialogOpen(true);
  }

  async function handleSave() {
    clearAll();
    let valid = true;
    if (!form.employee_id || form.employee_id === '__none__') {
      setError('employee_id', 'Please select an employee'); valid = false;
    }
    if (!form.title.trim()) {
      setError('title', 'Title is required'); valid = false;
    }
    if (!form.body_html.trim()) {
      setError('body_html', 'Letter body is required'); valid = false;
    }
    if (!valid) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      employee_id: form.employee_id,
      letter_type: form.letter_type,
      title: form.title.trim(),
      body_html: form.body_html.trim(),
      effective_date: form.effective_date || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    };
    if (form.status === 'issued' && (!editing || editing.status !== 'issued')) {
      payload.issued_by = user?.id ?? null;
      payload.issued_at = new Date().toISOString();
    }
    if (!editing) {
      payload.issued_by = form.status === 'issued' ? (user?.id ?? null) : null;
      payload.issued_at = form.status === 'issued' ? new Date().toISOString() : null;
    }
    const { error } = editing
      ? await supabase.from('hr_letters').update(payload).eq('id', editing.id)
      : await supabase.from('hr_letters').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Letter updated' : 'Letter created' });
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('hr_letters').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Letter deleted' }); load(); }
    setDeleteTarget(null);
  }

  async function handleSign(dataUrl: string) {
    if (!signingLetter || !user) return;
    const { error } = await supabase
      .from('hr_letters')
      .update({
        recipient_signature_url: dataUrl,
        signed_at: new Date().toISOString(),
        signed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', signingLetter.id);
    if (error) {
      toast({ title: 'Signing failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Letter signed successfully' });
      load();
    }
    setSigningLetter(null);
  }

  const filtered = letters.filter(l => {
    const emp = profiles.find(p => p.id === l.employee_id);
    const term = search.toLowerCase();
    const matchSearch = !term ||
      l.title.toLowerCase().includes(term) ||
      (emp?.full_name ?? '').toLowerCase().includes(term);
    const matchType = typeFilter === 'all' || l.letter_type === typeFilter;
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const empName = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : '—';

  const totalCount = letters.length;
  const draftCount = letters.filter(l => l.status === 'draft').length;
  const issuedCount = letters.filter(l => l.status === 'issued').length;
  const revokedCount = letters.filter(l => l.status === 'revoked').length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="HR Letters"
        description="Generate and manage employee letters, confirmations and formal correspondence"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Letter
          </Button>
        }
      />

      <div className="kd-stat-grid kd-stagger-in">
        {([
          { label: 'Total Letters', value: totalCount, icon: FileText, tone: 'default' },
          { label: 'Drafts', value: draftCount, icon: FilePlus, tone: 'warning' },
          { label: 'Issued', value: issuedCount, icon: FileCheck, tone: 'success' },
          { label: 'Revoked', value: revokedCount, icon: FileX, tone: 'danger' },
        ] as { label: string; value: number; icon: typeof FileText; tone: 'default' | 'warning' | 'success' | 'danger' }[]).map(({ label, value, icon, tone }) => (
          <StatCard key={label} title={label} value={value} icon={icon} tone={tone} />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Search HR letters" placeholder="Search title, employee..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as LetterType | 'all')}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TYPE_CONFIG) as LetterType[]).map(t => (
              <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as LetterStatus | 'all')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(STATUS_CONFIG) as LetterStatus[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No letters found"
          description="HR letters, confirmations and formal correspondence will appear here."
          action={
            <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> New Letter</Button>
          }
        />
      ) : (
        <>
        {/* Desktop table */}
        <div className="hidden md:block rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => {
                const typeCfg = TYPE_CONFIG[l.letter_type];
                const statusCfg = STATUS_CONFIG[l.status];
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.title}</TableCell>
                    <TableCell>{empName(l.employee_id)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[l.letter_type]}`}>
                        {typeCfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {l.effective_date ? format(parseISO(l.effective_date), 'dd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(parseISO(l.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {l.status === 'issued' && !l.recipient_signature_url && (
                          <Button variant="ghost" size="icon" onClick={() => setSigningLetter(l)} aria-label="Sign letter" title="Sign & acknowledge receipt">
                            <PenTool className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                        {l.recipient_signature_url && (
                          <span className="text-3xs font-medium text-success px-1">Signed</span>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(l)} aria-label="Edit letter">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(l)} aria-label="Delete letter">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2 p-3">
          {filtered.map(l => {
            const typeCfg = TYPE_CONFIG[l.letter_type];
            const statusCfg = STATUS_CONFIG[l.status];
            const statusAccent: Record<LetterStatus, string> = {
              draft: 'bg-warning',
              issued: 'bg-success',
              revoked: 'bg-destructive',
            };
            return (
              <MobileCard key={l.id} accentClassName={statusAccent[l.status]} chevron onClick={() => openEdit(l)}>
                <MobileCardHeader>
                  <MobileCardTitle>{l.title}</MobileCardTitle>
                  <MobileCardMeta>{empName(l.employee_id)}</MobileCardMeta>
                </MobileCardHeader>
                <MobileCardRow label="Type">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[l.letter_type]}`}>
                    {typeCfg.label}
                  </span>
                </MobileCardRow>
                <MobileCardRow label="Status">
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </MobileCardRow>
                <MobileCardRow label="Effective">
                  {l.effective_date ? format(parseISO(l.effective_date), 'dd MMM yyyy') : '—'}
                </MobileCardRow>
                <MobileCardRow label="Created">
                  {format(parseISO(l.created_at), 'dd MMM yyyy')}
                </MobileCardRow>
                {l.recipient_signature_url && (
                  <MobileCardRow label="Signature">
                    <span className="text-xs font-medium text-success">Signed</span>
                  </MobileCardRow>
                )}
                {l.status === 'issued' && !l.recipient_signature_url && (
                  <div className="pt-1">
                    <Button variant="outline" size="sm" className="w-full gap-1" onClick={e => { e.stopPropagation(); setSigningLetter(l); }}>
                      <PenTool className="h-3.5 w-3.5" /> Sign Letter
                    </Button>
                  </div>
                )}
              </MobileCard>
            );
          })}
        </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) clearAll(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Letter' : 'New HR Letter'}</DialogTitle>
            <DialogDescription>Create or update an employee letter</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="kd-label">Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => { setForm(f => ({ ...f, employee_id: v })); clearError('employee_id'); }}>
                <SelectTrigger aria-invalid={!!errors.employee_id}><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{'—'} Select employee {'—'}</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError message={errors.employee_id} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="kd-label">Letter Type</Label>
                <Select value={form.letter_type} onValueChange={v => setForm(f => ({ ...f, letter_type: v as LetterType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_CONFIG) as LetterType[]).map(t => (
                      <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="kd-label">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as LetterStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CONFIG) as LetterStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Title *</Label>
              <Input placeholder="e.g. Confirmation of Employment" value={form.title} aria-invalid={!!errors.title} onChange={e => { setForm(f => ({ ...f, title: e.target.value })); clearError('title'); }} />
              <FieldError message={errors.title} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Letter Body *</Label>
              <Textarea rows={8} placeholder="Full letter content (HTML supported)..." value={form.body_html} aria-invalid={!!errors.body_html} onChange={e => { setForm(f => ({ ...f, body_html: e.target.value })); clearError('body_html'); }} />
              <FieldError message={errors.body_html} />
            </div>
            <div className="space-y-1">
              <Label className="kd-label">Effective Date</Label>
              <Input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Letter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this letter?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!signingLetter} onOpenChange={o => !o && setSigningLetter(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign Letter</DialogTitle>
            <DialogDescription>
              Sign to acknowledge receipt of "{signingLetter?.title}"
            </DialogDescription>
          </DialogHeader>
          <SignaturePad
            signerName={empName(signingLetter?.employee_id ?? null)}
            label="Sign to acknowledge receipt"
            onSign={handleSign}
            onCancel={() => setSigningLetter(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
