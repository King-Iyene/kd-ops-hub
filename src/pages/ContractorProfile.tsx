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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface ContractorData {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<Partial<ContractorData>>({});
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

  const save = async () => {
    if (!id || !form) return;
    setSaving(true);
    const cName = displayName(form.first_name, form.last_name, form.full_name);
    const { error } = await supabase
      .from('contractors')
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        full_name: cName,
        default_amount_ngn: form.default_amount_ngn,
        linkedin_id: form.linkedin_id,
        linkedin_url: form.linkedin_url,
        notes: form.notes,
      })
      .eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('contractor_edited', `Contractor profile "${cName}" updated`, currentUser);
      toast({ title: 'Contractor profile saved' });
      load();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!id || !contractor) return;
    const { error } = await supabase.from('contractors').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('contractor_deleted', `Contractor "${contractor.full_name}" deleted`, currentUser);
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
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {ctrName}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
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
            <CardHeader><CardTitle className="text-base">Contractor details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First name</Label>
                  <Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Last name</Label>
                  <Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Default amount (₦)</Label>
                  <Input
                    type="number"
                    value={form.default_amount_ngn || 0}
                    onChange={(e) => patch({ default_amount_ngn: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn ID</Label>
                  <Input value={form.linkedin_id || ''} onChange={(e) => patch({ linkedin_id: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn URL</Label>
                  <Input value={form.linkedin_url || ''} onChange={(e) => patch({ linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes || ''}
                  onChange={(e) => patch({ notes: e.target.value })}
                  rows={3}
                  placeholder="Internal notes about this contractor..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Bank details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bank</Label>
                  <Input value={contractor.bank_name} disabled />
                </div>
                <div className="space-y-1">
                  <Label>Account number</Label>
                  <Input value={contractor.account_number} disabled />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Bank details are verified via Paystack and can only be changed through the Contractors list.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
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
