import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  CalendarDays,
  Save,
  Loader2,
  Briefcase,
  Linkedin,
  Landmark,
  CheckCircle2,
  XCircle,
  FileText,
  Shield,
  Trash2,
  ChevronDown,
  AlertTriangle,
  Pencil,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import { displayName, initialsOf } from '@/lib/name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { NIGERIAN_BANKS } from '@/lib/nigerian-banks';

interface ContractorData {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_name: string | null;
  default_amount_ngn: number;
  default_amount?: number | null;
  whatsapp_phone?: string | null;
  heyreach_email?: string | null;
  heyreach_password_enc?: string | null;
  linkedin_id: string | null;
  linkedin_url: string | null;
  notes: string | null;
  status: string;
  agreement_signed: boolean | null;
  kyc_document_uploaded: boolean | null;
  onboarding_complete: boolean | null;
  tags: string[] | null;
  created_at: string;
}

const onboardingChecks = (c: ContractorData) => [
  { label: 'Name', ok: !!(c.first_name || c.full_name) },
  { label: 'Bank verified', ok: /^\d{10}$/.test(c.account_number || '') && !!(c.bank_name) },
  { label: 'LinkedIn ID', ok: !!(c.linkedin_id && c.linkedin_id.trim()) },
  { label: 'Default amount', ok: (c.default_amount_ngn || 0) > 0 },
  { label: 'Agreement / KYC', ok: !!(c.agreement_signed || c.kyc_document_uploaded) },
];

const ContractorProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile: currentUser } = useAuthStore();

  const [contractor, setContractor] = useState<ContractorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmAnonymise, setConfirmAnonymise] = useState(false);
  const [anonymiseInput, setAnonymiseInput] = useState('');
  const [actioning, setActioning] = useState(false);
  const [form, setForm] = useState<Partial<ContractorData>>({});
  const [editMode, setEditMode] = useState(false);
  const [showPwdEdit, setShowPwdEdit] = useState(false);
  const [showPwdDisplay, setShowPwdDisplay] = useState(false);
  const [bankEditMode, setBankEditMode] = useState(false);
  const [bankForm, setBankForm] = useState({ account_number: '', bank_code: '' });
  const [bankVerifying, setBankVerifying] = useState(false);
  const [bankVerified, setBankVerified] = useState(false);
  const [bankVerifiedName, setBankVerifiedName] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('contractors')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) {
      toast({ title: 'Contractor not found', variant: 'destructive' });
      navigate('/contractors');
      return;
    }
    const c = data as ContractorData;
    setContractor(c);
    setForm(c);

    const [payRes, docRes, auditRes] = await Promise.all([
      supabase
        .from('batch_items')
        .select('*, payment_batches!inner(description, status, created_at)')
        .eq('contractor_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('documents').select('*').eq('entity_id', id)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('audit_logs').select('*')
        .or(`actor_id.eq.${id},description.ilike.%${id.slice(0, 8)}%`)
        .order('created_at', { ascending: false }).limit(50),
    ]);
    setPayments(payRes.data || []);
    setDocuments(docRes.data || []);
    setAuditLogs(auditRes.data || []);
    setLoading(false);
  }, [id, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const verify = async () => {
      setBankVerified(false);
      setBankVerifiedName(null);
      setBankError(null);
      if (!bankEditMode) return;
      const { account_number, bank_code } = bankForm;
      if (account_number.length !== 10 || !bank_code) return;
      setBankVerifying(true);
      try {
        const { data, error } = await supabase.functions.invoke('paystack-transfer', {
          body: { action: 'resolve_account', account_number, bank_code },
        });
        if (error || !data?.ok || !data?.data?.account_name) {
          throw new Error(data?.error || error?.message || 'Verification failed');
        }
        setBankVerifiedName(data.data.account_name);
        setBankVerified(true);
      } catch {
        setBankError('Could not verify — check account number and bank');
      } finally {
        setBankVerifying(false);
      }
    };
    void verify();
  }, [bankForm.account_number, bankForm.bank_code, bankEditMode]);

  const beginEdit = () => {
    if (!contractor) return;
    setForm({
      first_name: contractor.first_name || '',
      last_name: contractor.last_name || '',
      whatsapp_phone: contractor.whatsapp_phone || '',
      heyreach_email: contractor.heyreach_email || '',
      heyreach_password_enc: contractor.heyreach_password_enc || '',
      linkedin_url: contractor.linkedin_url || '',
      default_amount: contractor.default_amount ?? contractor.default_amount_ngn ?? 0,
      notes: contractor.notes || '',
    });
    setShowPwdEdit(false);
    setEditMode(true);
  };

  const cancelEdit = () => {
    if (contractor) setForm(contractor);
    setShowPwdEdit(false);
    setEditMode(false);
  };

  const save = async () => {
    if (!id || !form) return;
    setSaving(true);
    const cName = `${form.first_name || ''} ${form.last_name || ''}`.trim();
    const { error } = await supabase
      .from('contractors')
      .update({
        name: form.first_name + ' ' + form.last_name,
        phone: form.whatsapp_phone,
        heyreach_email: form.heyreach_email,
        heyreach_password_enc: form.heyreach_password_enc,
        linkedin_url: form.linkedin_url,
        default_amount: Number(form.default_amount),
        notes: form.notes,
      })
      .eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('contractor_edited', `Contractor profile "${cName}" updated`, currentUser);
      toast({ title: 'Contractor details saved' });
      setEditMode(false);
      setShowPwdEdit(false);
      load();
    }
    setSaving(false);
  };

  const saveBank = async () => {
    if (!id || !contractor || !bankVerified || !bankVerifiedName) return;
    setBankSaving(true);
    const selectedBank = NIGERIAN_BANKS.find((b) => b.code === bankForm.bank_code);
    const cName = `${contractor.first_name || ''} ${contractor.last_name || ''}`.trim() || contractor.full_name;
    const { error } = await supabase
      .from('contractors')
      .update({
        account_number: bankForm.account_number,
        bank_name: selectedBank?.name || '',
        bank_code: bankForm.bank_code,
        account_name: bankVerifiedName,
      })
      .eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('contractor_edited', `Bank details updated for "${cName}"`, currentUser);
      toast({ title: 'Bank details saved' });
      setBankEditMode(false);
      setBankVerified(false);
      setBankVerifiedName(null);
      load();
    }
    setBankSaving(false);
  };

  const handleDeactivate = async () => {
    if (!id || !contractor) return;
    setActioning(true);
    const next = contractor.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('contractors').update({ status: next }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit(
      next === 'inactive' ? 'contractor_deactivated' : 'contractor_edited',
      `Contractor "${contractor.full_name}" ${next === 'inactive' ? 'deactivated' : 'reactivated'}`,
      currentUser,
    );
    toast({ title: `Contractor ${next === 'inactive' ? 'deactivated' : 'reactivated'}` });
    setConfirmDeactivate(false);
    setActioning(false);
    load();
  };

  const handleAnonymise = async () => {
    if (!id || !contractor) return;
    setActioning(true);
    const { error } = await supabase.rpc('soft_delete_contractor', { p_contractor_id: id });
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit('contractor_deactivated', `Contractor "${contractor.full_name}" permanently anonymised`, currentUser);
    navigate('/contractors', { replace: true });
  };

  if (loading || !contractor) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const patch = (p: Partial<ContractorData>) => setForm((prev) => ({ ...prev, ...p }));
  const checks = onboardingChecks(contractor);
  const doneCnt = checks.filter((c) => c.ok).length;
  const pct = Math.round((doneCnt / checks.length) * 100);
  const ctrName = displayName(contractor.first_name, contractor.last_name, contractor.full_name);
  const canViewPassword = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  return (
    <div className="space-y-6 max-w-4xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button onClick={() => navigate('/contractors')} className="hover:text-foreground transition-colors">Contractors</button>
        <span>/</span>
        <span className="text-foreground">{ctrName}</span>
      </nav>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/contractors')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ctrName}</h1>
          <p className="text-muted-foreground text-sm">
            {contractor.bank_name} · {contractor.account_number}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={contractor.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}
        >
          {contractor.status}
        </Badge>
        {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Manage <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={beginEdit}>
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmDeactivate(true)}>
                {contractor.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </DropdownMenuItem>
              {currentUser?.role === 'super_admin' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => { setAnonymiseInput(''); setConfirmAnonymise(true); }}
                  >
                    Delete &amp; Anonymise
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Deactivate / reactivate dialog */}
      <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {contractor.status === 'active' ? 'Deactivate' : 'Reactivate'} {ctrName}?
            </DialogTitle>
            <DialogDescription>
              {contractor.status === 'active'
                ? `${ctrName} will be deactivated and hidden from active contractor lists. Their records remain visible and this can be reversed.`
                : `${ctrName} will be reactivated and restored to active status.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(false)} disabled={actioning}>
              Cancel
            </Button>
            <Button
              variant={contractor.status === 'active' ? 'destructive' : 'default'}
              onClick={handleDeactivate}
              disabled={actioning}
            >
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {contractor.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete & anonymise dialog (super_admin only) */}
      <Dialog open={confirmAnonymise} onOpenChange={(o) => { if (!o) { setConfirmAnonymise(false); setAnonymiseInput(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Permanently delete {ctrName}?
            </DialogTitle>
            <DialogDescription asChild>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-none">
                <li>• Their account will be permanently closed</li>
                <li>• Their name and contact details will be erased</li>
                <li>• Their payment records and task history will show as &ldquo;Former Contractor&rdquo; to preserve reports</li>
                <li className="font-semibold text-destructive">• This CANNOT be undone.</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type <strong>DELETE</strong> to confirm</Label>
            <Input
              value={anonymiseInput}
              onChange={(e) => setAnonymiseInput(e.target.value)}
              placeholder="DELETE"
              className={anonymiseInput === 'DELETE' ? 'border-destructive' : ''}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmAnonymise(false); setAnonymiseInput(''); }}
              disabled={actioning}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleAnonymise}
              disabled={anonymiseInput !== 'DELETE' || actioning}
            >
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hero card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
              <span className="text-2xl font-bold text-primary-foreground">
                {initialsOf(contractor.first_name, contractor.last_name, contractor.full_name)}
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" /> {contractor.bank_name} — {contractor.account_number}
              </p>
              {contractor.linkedin_id && (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Linkedin className="h-3.5 w-3.5" /> {contractor.linkedin_id}
                </p>
              )}
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Default: {formatNaira(contractor.default_amount_ngn)}
              </p>
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Added {formatDate(contractor.created_at)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding ({doneCnt}/{checks.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="text-base">Contractor details</CardTitle>
              {!editMode ? (
                <Button variant="outline" size="sm" onClick={beginEdit}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Details
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  {editMode ? (
                    <Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} />
                  ) : (
                    <p className="text-sm py-2">{contractor.first_name || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Last Name</Label>
                  {editMode ? (
                    <Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
                  ) : (
                    <p className="text-sm py-2">{contractor.last_name || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Phone / WhatsApp</Label>
                  {editMode ? (
                    <Input
                      value={form.whatsapp_phone || ''}
                      onChange={(e) => patch({ whatsapp_phone: e.target.value })}
                      placeholder="+234..."
                    />
                  ) : (
                    <p className="text-sm py-2">{contractor.whatsapp_phone || '—'}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>LinkedIn Email</Label>
                  {editMode ? (
                    <Input
                      type="email"
                      value={form.heyreach_email || ''}
                      onChange={(e) => patch({ heyreach_email: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm py-2 break-all">{contractor.heyreach_email || '—'}</p>
                  )}
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    LinkedIn Password
                  </Label>
                  {editMode ? (
                    <div className="relative">
                      <Input
                        type={showPwdEdit ? 'text' : 'password'}
                        value={form.heyreach_password_enc || ''}
                        onChange={(e) => patch({ heyreach_password_enc: e.target.value })}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwdEdit((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPwdEdit ? 'Hide password' : 'Show password'}
                      >
                        {showPwdEdit ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <p className="text-sm font-mono">
                        {showPwdDisplay ? (contractor.heyreach_password_enc || '—') : '••••••••'}
                      </p>
                      {canViewPassword && contractor.heyreach_password_enc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setShowPwdDisplay((v) => !v)}
                        >
                          {showPwdDisplay ? (
                            <><EyeOff className="mr-1 h-3.5 w-3.5" /> Hide</>
                          ) : (
                            <><Eye className="mr-1 h-3.5 w-3.5" /> View</>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>LinkedIn URL</Label>
                  {editMode ? (
                    <Input
                      value={form.linkedin_url || ''}
                      onChange={(e) => patch({ linkedin_url: e.target.value })}
                      placeholder="https://linkedin.com/in/..."
                    />
                  ) : contractor.linkedin_url ? (
                    <a
                      href={contractor.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all py-2 inline-block"
                    >
                      {contractor.linkedin_url}
                    </a>
                  ) : (
                    <p className="text-sm py-2">—</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Default Payment Amount (₦)</Label>
                  {editMode ? (
                    <Input
                      type="number"
                      value={form.default_amount ?? 0}
                      onChange={(e) => patch({ default_amount: Number(e.target.value) || 0 })}
                    />
                  ) : (
                    <p className="text-sm py-2 currency">
                      {formatNaira(contractor.default_amount ?? contractor.default_amount_ngn ?? 0)}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Internal Notes</Label>
                {editMode ? (
                  <Textarea
                    value={form.notes || ''}
                    onChange={(e) => patch({ notes: e.target.value })}
                    rows={3}
                    placeholder="Internal notes about this contractor..."
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap py-2 text-muted-foreground">
                    {contractor.notes || 'No notes added.'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="text-base">Bank details</CardTitle>
              {!bankEditMode ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBankForm({
                      account_number: contractor.account_number || '',
                      bank_code: contractor.bank_code || '',
                    });
                    setBankVerified(false);
                    setBankVerifiedName(null);
                    setBankError(null);
                    setBankEditMode(true);
                  }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Bank Details
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBankEditMode(false);
                    setBankVerified(false);
                    setBankVerifiedName(null);
                    setBankError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {bankEditMode ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Account Number</Label>
                      <Input
                        value={bankForm.account_number}
                        onChange={(e) =>
                          setBankForm((p) => ({
                            ...p,
                            account_number: e.target.value.replace(/\D/g, '').slice(0, 10),
                          }))
                        }
                        placeholder="0123456789"
                        maxLength={10}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Bank</Label>
                      <Select
                        value={bankForm.bank_code}
                        onValueChange={(v) => setBankForm((p) => ({ ...p, bank_code: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank..." />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_BANKS.map((b) => (
                            <SelectItem key={b.code + b.name} value={b.code}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {bankVerifying && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying account...
                    </div>
                  )}

                  {bankVerified && bankVerifiedName && !bankVerifying && (
                    <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Verified: {bankVerifiedName}
                    </div>
                  )}

                  {bankError && !bankVerifying && (
                    <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {bankError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button size="sm" onClick={saveBank} disabled={!bankVerified || bankSaving}>
                      {bankSaving
                        ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        : <Save className="mr-2 h-3.5 w-3.5" />}
                      Save Bank Details
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Bank</Label>
                      <p className="text-sm py-2">{contractor.bank_name || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label>Account Number</Label>
                      <p className="text-sm py-2 font-mono">{contractor.account_number || '—'}</p>
                    </div>
                    {contractor.account_name && (
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Account Name</Label>
                        <p className="text-sm py-2">{contractor.account_name}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Bank details are verified via Paystack and can only be changed through the Contractors list.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Payment history</CardTitle></CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div>
                        <p className="font-medium">{p.recipient_name || ctrName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.created_at)} · {p.payment_batches?.description || 'Batch payment'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium currency">{formatNaira(p.amount_ngn)}</p>
                        <Badge variant="secondary" className={
                          p.transfer_status === 'success' ? 'bg-success/10 text-success' :
                          p.transfer_status === 'failed' ? 'bg-destructive/10 text-destructive' :
                          'bg-warning/10 text-warning'
                        }>{p.transfer_status || 'pending'}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Onboarding progress — {pct}%</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full kd-transition ${pct === 100 ? 'bg-success' : pct >= 60 ? 'bg-accent' : 'bg-destructive'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="space-y-2">
                {checks.map((c) => (
                  <div key={c.label} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                    {c.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={`text-sm ${c.ok ? '' : 'text-muted-foreground'}`}>{c.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium">{d.name || d.file_name || 'Untitled'}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.document_type?.replace(/_/g, ' ') || 'Document'} · {formatDate(d.created_at)}
                          </p>
                        </div>
                      </div>
                      {d.file_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={d.file_url} target="_blank" rel="noopener noreferrer">View</a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity log</CardTitle></CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 border rounded-lg p-3">
                      <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{log.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(log.created_at)}
                          {log.action_type && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                              {log.action_type.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContractorProfile;
