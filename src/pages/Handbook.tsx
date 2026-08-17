import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Pencil, Trash2, BookOpen, CheckCircle2,
  FileText, Eye, Loader2, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { sanitizeHtml } from '@/lib/sanitize';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';

const CATEGORIES = [
  'general', 'code_of_conduct', 'leave', 'it_security', 'health_safety',
  'anti_harassment', 'data_privacy', 'dress_code', 'remote_work', 'other',
] as const;
type PolicyCategory = typeof CATEGORIES[number];

const CATEGORY_LABEL: Record<PolicyCategory, string> = {
  general: 'General',
  code_of_conduct: 'Code of Conduct',
  leave: 'Leave',
  it_security: 'IT Security',
  health_safety: 'Health & Safety',
  anti_harassment: 'Anti-Harassment',
  data_privacy: 'Data Privacy',
  dress_code: 'Dress Code',
  remote_work: 'Remote Work',
  other: 'Other',
};

const CATEGORY_COLOR: Record<PolicyCategory, string> = {
  general: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  code_of_conduct: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  leave: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  it_security: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  health_safety: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  anti_harassment: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  data_privacy: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  dress_code: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  remote_work: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

interface Policy {
  id: string;
  title: string;
  category: PolicyCategory;
  content_html: string;
  version: number;
  is_active: boolean;
  requires_acknowledgment: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Acknowledgment {
  id: string;
  policy_id: string;
  employee_id: string;
  acknowledged_at: string;
  policy_version: number;
}

const TAB_TRIGGER_CLASS = 'text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none';

const EMPTY_FORM = {
  title: '',
  category: 'general' as PolicyCategory,
  content_html: '',
  version: 1,
  is_active: true,
  requires_acknowledgment: true,
};

export default function Handbook() {
  usePageTitle('Handbook');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<Acknowledgment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const [viewPolicy, setViewPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pData }, { data: aData }] = await Promise.all([
      supabase.from('handbook_policies').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('policy_acknowledgments').select('*').limit(5000),
    ]);
    setPolicies((pData as Policy[]) || []);
    setAcknowledgments((aData as Acknowledgment[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const myAcks = useMemo(
    () => acknowledgments.filter(a => a.employee_id === profile?.id),
    [acknowledgments, profile?.id],
  );

  const ackCountByPolicy = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of acknowledgments) {
      map[a.policy_id] = (map[a.policy_id] || 0) + 1;
    }
    return map;
  }, [acknowledgments]);

  const hasAcked = useCallback(
    (policy: Policy) => myAcks.some(a => a.policy_id === policy.id && a.policy_version === policy.version),
    [myAcks],
  );

  const activePolicies = useMemo(() => policies.filter(p => p.is_active), [policies]);

  const pendingCount = useMemo(
    () => activePolicies.filter(p => p.requires_acknowledgment && !hasAcked(p)).length,
    [activePolicies, hasAcked],
  );

  const ackRate = useMemo(() => {
    const requiresAck = activePolicies.filter(p => p.requires_acknowledgment);
    if (requiresAck.length === 0) return 100;
    const acked = requiresAck.filter(p => hasAcked(p)).length;
    return Math.round((acked / requiresAck.length) * 100);
  }, [activePolicies, hasAcked]);

  const filtered = useMemo(() => policies.filter(p => {
    if (catFilter !== 'all' && p.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || CATEGORY_LABEL[p.category].toLowerCase().includes(q);
    }
    return true;
  }), [policies, catFilter, search]);

  const myPolicies = useMemo(
    () => activePolicies.filter(p => p.requires_acknowledgment),
    [activePolicies],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (p: Policy) => {
    setEditing(p);
    setForm({
      title: p.title,
      category: p.category,
      content_html: p.content_html,
      version: p.version,
      is_active: p.is_active,
      requires_acknowledgment: p.requires_acknowledgment,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content_html.trim()) {
      toast({ title: 'Title and content are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      category: form.category,
      content_html: form.content_html.trim(),
      version: form.version,
      is_active: form.is_active,
      requires_acknowledgment: form.requires_acknowledgment,
      published_at: form.is_active ? new Date().toISOString() : null,
      created_by: profile?.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = editing
      ? await supabase.from('handbook_policies').update(payload).eq('id', editing.id)
      : await supabase.from('handbook_policies').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing ? 'Policy updated' : 'Policy created' });
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('handbook_policies').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Policy deleted' });
    setDeleteTarget(null);
    load();
  };

  const [signingPolicy, setSigningPolicy] = useState<Policy | null>(null);

  const acknowledge = async (policy: Policy, signatureDataUrl: string) => {
    if (!profile?.id) return;
    setAcknowledging(policy.id);
    const { error } = await supabase.from('policy_acknowledgments').insert({
      policy_id: policy.id,
      employee_id: profile.id,
      policy_version: policy.version,
      signature_data_url: signatureDataUrl,
    });
    setAcknowledging(null);
    setSigningPolicy(null);
    setViewPolicy(null);
    if (error) {
      toast({ title: 'Acknowledgment failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Policy acknowledged & signed', description: `You signed "${policy.title}" v${policy.version}.` });
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Employee Handbook"
        description="Company policies and acknowledgment tracking."
        actions={
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Policy</Button>
        }
      />

      <div className="kd-stat-grid">
        <StatCard title="Total Policies" value={policies.length} icon={FileText} tone="primary" />
        <StatCard title="Active" value={activePolicies.length} icon={BookOpen} tone="success" />
        <StatCard title="Pending Acknowledgments" value={pendingCount} icon={ShieldCheck} tone="warning" />
        <StatCard title="Acknowledgment Rate" value={`${ackRate}%`} icon={CheckCircle2} tone="success" />
      </div>

      <Tabs defaultValue="policies" className="space-y-4">
        <TabsList className="bg-transparent border-b rounded-none w-full justify-start px-0">
          <TabsTrigger value="policies" className={TAB_TRIGGER_CLASS}>Policies</TabsTrigger>
          <TabsTrigger value="acknowledgments" className={TAB_TRIGGER_CLASS}>My Acknowledgments</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-10 sm:h-9" placeholder="Search policies…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-44 h-10 sm:h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={FileText} title="No policies found" description={search || catFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first policy to get started.'} />
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium px-4 py-3">Title</th>
                    <th className="text-left font-medium px-4 py-3">Category</th>
                    <th className="text-center font-medium px-4 py-3">Version</th>
                    <th className="text-center font-medium px-4 py-3">Active</th>
                    <th className="text-center font-medium px-4 py-3">Requires Ack</th>
                    <th className="text-center font-medium px-4 py-3">Acknowledged</th>
                    <th className="text-left font-medium px-4 py-3">Published</th>
                    <th className="text-right font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_COLOR[p.category]}`}>
                          {CATEGORY_LABEL[p.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">v{p.version}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {p.is_active ? 'Yes' : 'No'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{p.requires_acknowledgment ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{ackCountByPolicy[p.id] || 0}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.published_at ? format(parseISO(p.published_at), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewPolicy(p)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="acknowledgments" className="space-y-4">
          {pendingCount > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Your Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{myPolicies.filter(p => hasAcked(p)).length} of {myPolicies.length} acknowledged</span>
                  <span>{ackRate}%</span>
                </div>
                <Progress value={ackRate} className="h-2" />
              </CardContent>
            </Card>
          )}

          {loading ? (
            <TableSkeleton cols={4} rows={5} />
          ) : myPolicies.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No policies require acknowledgment" description="All clear — there are no active policies requiring your acknowledgment." />
          ) : (
            <div className="space-y-3">
              {myPolicies.map(p => {
                const acked = hasAcked(p);
                return (
                  <Card key={p.id} className="overflow-hidden">
                    <div className="flex items-center justify-between p-4 gap-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm truncate">{p.title}</h3>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLOR[p.category]}`}>
                            {CATEGORY_LABEL[p.category]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">v{p.version}</span>
                        </div>
                        {p.published_at && (
                          <p className="text-xs text-muted-foreground">Published {format(parseISO(p.published_at), 'MMM d, yyyy')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewPolicy(p)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {acked ? (
                          <Badge variant="default" className="text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Signed
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => setSigningPolicy(p)}
                            disabled={acknowledging === p.id}
                          >
                            {acknowledging === p.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                            Sign & Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Policy Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Policy' : 'Create Policy'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the policy details below.' : 'Fill in the details to create a new policy.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Policy title" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as PolicyCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">Content (HTML)</Label>
              <Textarea
                id="content"
                value={form.content_html}
                onChange={e => setForm(f => ({ ...f, content_html: e.target.value }))}
                placeholder="<p>Policy content here…</p>"
                rows={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="version">Version</Label>
              <Input id="version" type="number" min={1} value={form.version} onChange={e => setForm(f => ({ ...f, version: parseInt(e.target.value) || 1 }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch id="is_active" checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="requires_ack">Requires Acknowledgment</Label>
              <Switch id="requires_ack" checked={form.requires_acknowledgment} onCheckedChange={v => setForm(f => ({ ...f, requires_acknowledgment: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Policy Dialog */}
      <Dialog open={!!viewPolicy} onOpenChange={() => setViewPolicy(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewPolicy && (
            <>
              <DialogHeader>
                <DialogTitle>{viewPolicy.title}</DialogTitle>
                <DialogDescription>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium mr-2 ${CATEGORY_COLOR[viewPolicy.category]}`}>
                    {CATEGORY_LABEL[viewPolicy.category]}
                  </span>
                  Version {viewPolicy.version}
                  {viewPolicy.published_at && ` · Published ${format(parseISO(viewPolicy.published_at), 'MMM d, yyyy')}`}
                </DialogDescription>
              </DialogHeader>
              <div
                className="prose prose-sm dark:prose-invert max-w-none py-4"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(viewPolicy.content_html) }}
              />
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {viewPolicy.requires_acknowledgment && (
                  hasAcked(viewPolicy) ? (
                    <Badge variant="default" className="text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />Signed
                    </Badge>
                  ) : (
                    <Button onClick={() => { setSigningPolicy(viewPolicy); }} disabled={acknowledging === viewPolicy.id}>
                      {acknowledging === viewPolicy.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Sign & Acknowledge
                    </Button>
                  )
                )}
                <Button variant="outline" onClick={() => setViewPolicy(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* E-Signature Dialog */}
      <Dialog open={!!signingPolicy} onOpenChange={() => setSigningPolicy(null)}>
        <DialogContent className="sm:max-w-md">
          {signingPolicy && (
            <>
              <DialogHeader>
                <DialogTitle>Sign & Acknowledge</DialogTitle>
                <DialogDescription>
                  You are signing to acknowledge that you have read and understood
                  <span className="font-semibold text-foreground"> "{signingPolicy.title}"</span> (v{signingPolicy.version}).
                </DialogDescription>
              </DialogHeader>
              <SignaturePad
                signerName={profile?.full_name ?? ''}
                label="Your signature"
                onSign={(dataUrl) => acknowledge(signingPolicy, dataUrl)}
                onCancel={() => setSigningPolicy(null)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.title}" and all related acknowledgments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
