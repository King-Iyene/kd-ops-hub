import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Download, Pencil, Trash2, Loader2, Users, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { MANAGER_ROLES, hasRole } from '@/lib/roles';
import { formatDate, formatNaira, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
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
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';

type ClientStatus = 'active' | 'inactive' | 'prospect';

interface Client {
  id: string;
  name: string;
  industry: string | null;
  status: ClientStatus;
  contract_value_ngn: number | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
}

const emptyForm = {
  name: '',
  industry: '',
  status: 'prospect' as ClientStatus,
  contract_value_ngn: '',
  contact_person: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  start_date: '',
  notes: '',
};

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  prospect: 'Prospect',
};

const STATUS_TONE: Record<ClientStatus, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
  prospect: 'bg-info/10 text-info',
};

const INDUSTRIES = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Education',
  'Retail & E-commerce', 'Manufacturing', 'Construction', 'Agriculture',
  'Media & Entertainment', 'Logistics & Transport', 'Energy & Utilities',
  'Government & NGO', 'Real Estate', 'Food & Beverage', 'Other',
];

const Clients = () => {
  usePageTitle('Clients');
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [placementStats, setPlacementStats] = useState<Record<string, { active: number; monthlyRevenue: number; commission: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);

  const canManage = hasRole(profile?.role, MANAGER_ROLES);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientRes, placementRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .is('deleted_at', null)
          .order('name')
          .limit(500),
        supabase
          .from('placements')
          .select('id, client_id, client_rate_ngn, commission_ngn, status')
          .in('status', ['active', 'pending'])
          .limit(2000),
      ]);
      if (clientRes.error) throw clientRes.error;
      setClients((clientRes.data as Client[]) || []);

      const pStats: Record<string, { active: number; monthlyRevenue: number; commission: number }> = {};
      for (const p of (placementRes.data || []) as any[]) {
        if (!pStats[p.client_id]) pStats[p.client_id] = { active: 0, monthlyRevenue: 0, commission: 0 };
        if (p.status === 'active') pStats[p.client_id].active += 1;
        pStats[p.client_id].monthlyRevenue += Number(p.client_rate_ngn || 0);
        pStats[p.client_id].commission += Number(p.commission_ngn || 0);
      }
      setPlacementStats(pStats);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load clients';
      if (/schema cache|does not exist|public\.clients/i.test(msg)) {
        setError(
          'The Clients module needs a database migration that has not been deployed yet. ' +
          'Ask an admin to run "supabase db push" to apply migration 20260428000002_create_clients.sql.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.contact_person || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      );
    });
  }, [clients, debouncedSearch, statusFilter]);

  const pagination = usePagination(filtered, 25);

  const stats = useMemo(() => {
    const totalPlacements = Object.values(placementStats).reduce((s, p) => s + p.active, 0);
    const totalMonthlyRevenue = Object.values(placementStats).reduce((s, p) => s + p.monthlyRevenue, 0);
    const totalCommission = Object.values(placementStats).reduce((s, p) => s + p.commission, 0);
    return {
      total: clients.length,
      active: clients.filter((c) => c.status === 'active').length,
      prospects: clients.filter((c) => c.status === 'prospect').length,
      totalValue: clients
        .filter((c) => c.status === 'active')
        .reduce((s, c) => s + Number(c.contract_value_ngn || 0), 0),
      totalPlacements,
      totalMonthlyRevenue,
      totalCommission,
    };
  }, [clients, placementStats]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialog(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      industry: c.industry || '',
      status: c.status,
      contract_value_ngn: c.contract_value_ngn ? String(c.contract_value_ngn) : '',
      contact_person: c.contact_person || '',
      email: c.email || '',
      phone: c.phone || '',
      website: c.website || '',
      address: c.address || '',
      start_date: c.start_date || '',
      notes: c.notes || '',
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Client name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        status: form.status,
        contract_value_ngn: Number(form.contract_value_ngn) || 0,
        contact_person: form.contact_person.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        start_date: form.start_date || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const { error: err } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editing.id);
        if (err) throw err;
        await logAudit('client_updated', `Client "${payload.name}" updated`, profile);
        toast({ title: 'Client updated' });
      } else {
        const { error: err } = await supabase
          .from('clients')
          .insert({ ...payload, created_by: profile?.id });
        if (err) throw err;
        await logAudit('client_created', `Client "${payload.name}" added`, profile);
        toast({ title: 'Client added' });
      }
      setDialog(false);
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (c: Client) => {
    setPendingDelete(null);
    const { error: err } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', c.id);
    if (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      return;
    }
    await logAudit('client_deleted', `Client "${c.name}" deleted`, profile);
    toast({ title: 'Client removed' });
    load();
  };

  const exportCsv = () => {
    const header = ['name', 'industry', 'status', 'contract_value_ngn', 'contact_person', 'email', 'phone', 'start_date', 'created_at'];
    const rows = filtered.map((c) => [
      c.name,
      c.industry || '',
      c.status,
      c.contract_value_ngn,
      c.contact_person || '',
      c.email || '',
      c.phone || '',
      c.start_date ? formatDate(c.start_date) : '',
      formatDate(c.created_at),
    ]);
    downloadCsv(`kdops-clients-${toIsoDate(new Date())}.csv`, toCsv(header, rows));
  };

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AuroraHero className="p-5 sm:p-6" pattern="constellation">
        <PageHeader
          className="mb-0"
          title="Clients"
          description="Track your active clients, prospects, and contract values"
          icon={Building2}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              {canManage && (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="mr-2 h-4 w-4" /> Add Client
                </Button>
              )}
            </div>
          }
        />
      </AuroraHero>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Total Clients" value={stats.total} icon={Building2} tone="primary" />
        <StatCard title="Active" value={stats.active} tone="success" />
        <StatCard title="Prospects" value={stats.prospects} tone="warning" />
        <StatCard title="Active Placements" value={stats.totalPlacements} icon={Users} tone="primary" subtitle="Employees deployed" />
        <StatCard title="Monthly Revenue" value={formatNaira(stats.totalMonthlyRevenue)} icon={TrendingUp} tone="gold" subtitle="All active placements" />
        <StatCard title="KD Commission" value={formatNaira(stats.totalCommission)} tone="success" subtitle="Monthly earnings" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search || statusFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}
              description={canManage ? 'Add your first client to start tracking contracts and contacts.' : undefined}
              icon={Building2}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead className="text-right">Contract Value</TableHead>
                      <TableHead className="text-center">Placements</TableHead>
                      <TableHead className="text-right">Monthly Revenue</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      {canManage && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.items.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer kd-transition"
                        onClick={() => navigate(`/clients/${c.id}`)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{c.name}</p>
                            {c.email && (
                              <p className="text-xs text-muted-foreground">{c.email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.industry || '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium currency">
                          {Number(c.contract_value_ngn || 0) > 0 ? formatNaira(c.contract_value_ngn) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {placementStats[c.id]?.active ? (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              {placementStats[c.id].active}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium currency">
                          {placementStats[c.id]?.monthlyRevenue
                            ? formatNaira(placementStats[c.id].monthlyRevenue)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <div>
                            {c.contact_person && <p className="text-sm">{c.contact_person}</p>}
                            {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_TONE[c.status]}>
                            {STATUS_LABELS[c.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.start_date ? formatDate(c.start_date) : '—'}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                                title="Edit"
                                aria-label={`Edit ${c.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setPendingDelete(c); }}
                                title="Delete"
                                aria-label={`Delete ${c.name}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={pagination.setPage}
                className="border-t px-4 py-3"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialog} onOpenChange={(v) => { if (!v) setDialog(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit client' : 'Add client'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Client name *</Label>
                <Input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme Corporation"
                />
              </div>
              <div className="space-y-1">
                <Label>Industry</Label>
                <Select
                  value={form.industry}
                  onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as ClientStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Contract value (₦)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.contract_value_ngn}
                  onChange={(e) => setForm((f) => ({ ...f, contract_value_ngn: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>Start date</Label>
                <Input
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Contact person</Label>
                <Input
                  value={form.contact_person}
                  onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                  placeholder="Name of main contact"
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+234 800 000 0000"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Office address"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional context about this client…"
                  rows={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !canManage}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove client?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be hidden from all screens. The record is kept in the database and can be recovered by an admin if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteClient(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Clients;
