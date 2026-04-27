import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Users,
  Loader2,
  Download,
  Pencil,
  Star,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';

interface Referral {
  id: string;
  referrer_id: string | null;
  referred_email: string;
  status: string;
  is_affiliate: boolean;
  commission_pct: number;
  commission_earned_ngn: number;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
}

const Referrals = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin =
    profile?.role === 'super_admin' || profile?.role === 'admin';

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [contractors, setContractors] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contractor_id: '',
    referred_by: '',
    referred_email: '',
    is_affiliate: false,
    commission_pct: '0',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [refRes, profRes, contractorRes] = await Promise.all([
      supabase
        .from('referrals')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('contractors').select('id, full_name').eq('status', 'active').order('full_name'),
    ]);
    setReferrals((refRes.data as Referral[]) || []);
    const m = new Map<string, ProfileRow>();
    for (const p of (profRes.data as ProfileRow[]) || []) m.set(p.id, p);
    setProfiles(m);
    setContractors((contractorRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addReferral = async () => {
    if (!form.contractor_id && !form.referred_email.trim()) {
      toast({ title: 'Select a contractor or enter an email', variant: 'destructive' });
      return;
    }
    if (!form.referred_by.trim()) {
      toast({ title: 'Enter who referred this person', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const contractorName = form.contractor_id
        ? contractors.find((c) => c.id === form.contractor_id)?.full_name || ''
        : form.referred_email;
      const { error } = await supabase.from('referrals').insert({
        referrer_id: profile?.id || null,
        referred_email: form.referred_email.trim().toLowerCase() || contractorName,
        is_affiliate: form.is_affiliate,
        commission_pct: parseFloat(form.commission_pct) || 0,
        status: 'active',
      });
      if (error) throw error;
      await logAudit(
        'contractor_added',
        `Referral added: ${contractorName} (referred by ${form.referred_by})`,
        profile,
      );
      toast({ title: 'Referral added' });
      setDialog(false);
      setForm({ contractor_id: '', referred_by: '', referred_email: '', is_affiliate: false, commission_pct: '0', notes: '' });
      load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleAffiliate = async (r: Referral) => {
    const next = !r.is_affiliate;
    await supabase
      .from('referrals')
      .update({ is_affiliate: next })
      .eq('id', r.id);
    toast({ title: next ? 'Marked as affiliate' : 'Removed affiliate status' });
    load();
  };

  const exportCsv = () => {
    const header = ['referrer', 'referred_email', 'status', 'affiliate', 'commission_pct', 'created_at'];
    const rows = referrals.map((r) => {
      const referrer = r.referrer_id ? profiles.get(r.referrer_id) : null;
      return [
        referrer?.full_name || '—',
        r.referred_email,
        r.status,
        r.is_affiliate ? 'Yes' : 'No',
        r.commission_pct,
        r.created_at,
      ];
    });
    downloadCsv('kdops-referrals.csv', toCsv(header, rows));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return referrals;
    return referrals.filter(
      (r) =>
        r.referred_email.toLowerCase().includes(q) ||
        (r.referrer_id && profiles.get(r.referrer_id)?.full_name.toLowerCase().includes(q)),
    );
  }, [referrals, search, profiles]);

  const pagination = usePagination(filtered, 20);

  const affiliateCount = referrals.filter((r) => r.is_affiliate).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referrals"
        description="Track who referred whom. Manage affiliates and commissions."
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" onClick={exportCsv} disabled={referrals.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setDialog(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add referral
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total referrals</p>
            <p className="text-2xl font-bold mt-1">{referrals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Affiliates</p>
            <p className="text-2xl font-bold mt-1">{affiliateCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold mt-1">
              {referrals.filter((r) => r.status === 'pending').length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No referrals yet"
              description="Add referrals manually to track who brought whom to KD Squares."
              action={
                isAdmin ? (
                  <Button onClick={() => setDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add referral
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Referred</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Commission %</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    const referrer = r.referrer_id
                      ? profiles.get(r.referrer_id)
                      : null;
                    return (
                      <TableRow key={r.id} className="kd-transition">
                        <TableCell className="font-medium">
                          {referrer?.full_name || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.referred_email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              r.status === 'active'
                                ? 'bg-success/10 text-success'
                                : 'bg-warning/10 text-warning'
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.is_affiliate ? (
                            <Badge className="bg-accent/15 text-accent-foreground border border-accent/40">
                              <Star className="h-3 w-3 mr-1" /> Affiliate
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.commission_pct > 0 ? `${r.commission_pct}%` : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(r.created_at)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleAffiliate(r)}
                              title={r.is_affiliate ? 'Remove affiliate' : 'Make affiliate'}
                            >
                              <Star className={`h-4 w-4 ${r.is_affiliate ? 'text-accent fill-accent' : ''}`} />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
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
            <DialogTitle>Add referral</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Contractor (select from list)</Label>
              <Select
                value={form.contractor_id || 'none'}
                onValueChange={(v) => setForm({ ...form, contractor_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— or enter email below —</SelectItem>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.contractor_id && (
              <div className="space-y-1">
                <Label>Or enter email manually</Label>
                <Input
                  type="email"
                  value={form.referred_email}
                  onChange={(e) => setForm({ ...form, referred_email: e.target.value })}
                  placeholder="person@example.com"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Who referred them? *</Label>
              <Input
                value={form.referred_by}
                onChange={(e) => setForm({ ...form, referred_by: e.target.value })}
                placeholder="Name of the person who made the referral"
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional — context about this referral"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_affiliate}
                onCheckedChange={(v) => setForm({ ...form, is_affiliate: v })}
              />
              <Label>Mark as affiliate</Label>
            </div>
            {form.is_affiliate && (
              <div className="space-y-1">
                <Label>Commission percentage</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.commission_pct}
                  onChange={(e) => setForm({ ...form, commission_pct: e.target.value })}
                  placeholder="e.g. 5"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addReferral} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add referral
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Referrals;
