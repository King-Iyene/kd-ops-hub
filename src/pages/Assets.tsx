import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, Package,
  AlertTriangle, CheckCircle2, Archive, TrendingDown,
  Calendar, User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { format, parseISO, differenceInDays, differenceInMonths } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

// CITA capital allowance rates by category (initial %, annual %)
const CATEGORY_META: Record<string, { label: string; initial: number; annual: number; life: number }> = {
  plant_machinery:       { label: 'Plant & Machinery',       initial: 50, annual: 25, life: 5  },
  motor_vehicle:         { label: 'Motor Vehicle',           initial: 50, annual: 25, life: 4  },
  furniture_fittings:    { label: 'Furniture & Fittings',    initial: 25, annual: 20, life: 5  },
  it_equipment:          { label: 'IT Equipment',            initial: 50, annual: 25, life: 3  },
  land_building:         { label: 'Land & Building',         initial: 10, annual: 10, life: 25 },
  leasehold_improvement: { label: 'Leasehold Improvement',   initial: 25, annual: 20, life: 5  },
  other:                 { label: 'Other',                   initial: 0,  annual: 0,  life: 5  },
};

type Category = keyof typeof CATEGORY_META;

interface Asset {
  id: string;
  asset_number: string;
  name: string;
  category: Category;
  description: string | null;
  purchase_date: string;
  cost_ngn: number;
  useful_life_years: number;
  salvage_value_ngn: number;
  depreciation_method: string;
  initial_allowance_rate: number;
  annual_allowance_rate: number;
  location: string | null;
  assigned_to: string | null;
  department_id: string | null;
  insurer: string | null;
  insurance_policy_number: string | null;
  insurance_expiry: string | null;
  insurance_value_ngn: number | null;
  status: 'active' | 'disposed' | 'written_off';
  disposal_date: string | null;
  disposal_proceeds_ngn: number | null;
  notes: string | null;
  created_at: string;
}

interface Profile { id: string; full_name: string; }
interface Department { id: string; name: string; }

function bookValue(asset: Asset): number {
  if (asset.status !== 'active') return 0;
  const months = differenceInMonths(new Date(), parseISO(asset.purchase_date));
  const years = Math.max(0, months / 12);
  const depreciable = asset.cost_ngn - asset.salvage_value_ngn;
  if (asset.depreciation_method === 'straight_line') {
    const annual = depreciable / asset.useful_life_years;
    return Math.max(asset.salvage_value_ngn, asset.cost_ngn - annual * Math.min(years, asset.useful_life_years));
  }
  // reducing balance
  const rate = 1 - Math.pow(asset.salvage_value_ngn / Math.max(asset.cost_ngn, 1), 1 / asset.useful_life_years);
  return Math.max(asset.salvage_value_ngn, asset.cost_ngn * Math.pow(1 - rate, years));
}

function totalDepreciation(asset: Asset): number {
  return asset.cost_ngn - bookValue(asset);
}

function insuranceExpiryBadge(expiry: string | null) {
  if (!expiry) return null;
  const days = differenceInDays(parseISO(expiry), new Date());
  if (days < 0)   return <Badge variant="destructive" className="text-[10px]">Expired</Badge>;
  if (days <= 30) return <Badge variant="outline" className="text-[10px] border-warning text-warning">Ins. expires {days}d</Badge>;
  return null;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default'|'secondary'|'destructive' }> = {
  active:      { label: 'Active',      variant: 'default' },
  disposed:    { label: 'Disposed',    variant: 'secondary' },
  written_off: { label: 'Written Off', variant: 'destructive' },
};

const EMPTY_FORM = {
  name: '', category: 'it_equipment' as Category, description: '',
  purchase_date: '', cost_ngn: '', useful_life_years: '', salvage_value_ngn: '0',
  depreciation_method: 'straight_line', initial_allowance_rate: '', annual_allowance_rate: '',
  location: '', assigned_to: '__none__', department_id: '__none__',
  insurer: '', insurance_policy_number: '', insurance_expiry: '', insurance_value_ngn: '',
  status: 'active', notes: '',
};

export default function Assets() {
  usePageTitle('Assets');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [catFilter, setCatFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: aData }, { data: pData }, { data: dData }] = await Promise.all([
      supabase.from('assets').select('*').order('purchase_date', { ascending: false }).limit(500),
      supabase.from('profiles').select('id, full_name').limit(200),
      supabase.from('departments').select('id, name').order('name').limit(100),
    ]);
    setAssets((aData as Asset[]) || []);
    setProfiles((pData as Profile[]) || []);
    setDepartments((dData as Department[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nextAssetNumber = async () => {
    const year = new Date().getFullYear();
    const { count } = await supabase.from('assets').select('*', { count: 'exact', head: true });
    return `AST-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;
  };

  const openCreate = () => {
    setEditing(null);
    const meta = CATEGORY_META['it_equipment'];
    setForm({ ...EMPTY_FORM, useful_life_years: String(meta.life), initial_allowance_rate: String(meta.initial), annual_allowance_rate: String(meta.annual) });
    setDialogOpen(true);
  };

  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      name: a.name, category: a.category, description: a.description ?? '',
      purchase_date: a.purchase_date, cost_ngn: String(a.cost_ngn),
      useful_life_years: String(a.useful_life_years), salvage_value_ngn: String(a.salvage_value_ngn),
      depreciation_method: a.depreciation_method,
      initial_allowance_rate: String(a.initial_allowance_rate), annual_allowance_rate: String(a.annual_allowance_rate),
      location: a.location ?? '', assigned_to: a.assigned_to ?? '__none__',
      department_id: a.department_id ?? '__none__',
      insurer: a.insurer ?? '', insurance_policy_number: a.insurance_policy_number ?? '',
      insurance_expiry: a.insurance_expiry ?? '', insurance_value_ngn: String(a.insurance_value_ngn ?? ''),
      status: a.status, notes: a.notes ?? '',
    });
    setDialogOpen(true);
  };

  const onCategoryChange = (cat: Category) => {
    const meta = CATEGORY_META[cat];
    setForm(p => ({ ...p, category: cat, useful_life_years: String(meta.life), initial_allowance_rate: String(meta.initial), annual_allowance_rate: String(meta.annual) }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.purchase_date || !form.cost_ngn) {
      toast({ title: 'Name, purchase date and cost are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const assetNumber = editing ? editing.asset_number : await nextAssetNumber();
    const payload = {
      asset_number: assetNumber,
      name: form.name.trim(), category: form.category,
      description: form.description.trim() || null,
      purchase_date: form.purchase_date, cost_ngn: Number(form.cost_ngn),
      useful_life_years: Number(form.useful_life_years) || 5,
      salvage_value_ngn: Number(form.salvage_value_ngn) || 0,
      depreciation_method: form.depreciation_method,
      initial_allowance_rate: Number(form.initial_allowance_rate) || 0,
      annual_allowance_rate: Number(form.annual_allowance_rate) || 0,
      location: form.location.trim() || null,
      assigned_to: form.assigned_to !== '__none__' ? form.assigned_to : null,
      department_id: form.department_id !== '__none__' ? form.department_id : null,
      insurer: form.insurer.trim() || null,
      insurance_policy_number: form.insurance_policy_number.trim() || null,
      insurance_expiry: form.insurance_expiry || null,
      insurance_value_ngn: form.insurance_value_ngn ? Number(form.insurance_value_ngn) : null,
      status: form.status, notes: form.notes.trim() || null,
      created_by: profile?.id,
    };
    const { error } = editing
      ? await supabase.from('assets').update(payload).eq('id', editing.id)
      : await supabase.from('assets').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Asset updated' : 'Asset added' });
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', deleteTarget.id);
    setDeleting(false);
    toast({ title: 'Asset removed' });
    setDeleteTarget(null);
    load();
  };

  const filtered = assets.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (catFilter !== 'all' && a.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.asset_number.toLowerCase().includes(q) || (a.location ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const exportCSV = () => {
    const header = 'Asset No,Name,Category,Status,Purchase Date,Cost (₦),Book Value (₦),Depreciation (₦),Assigned To,Insurance Expiry';
    const nameOf = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '') : '';
    const rows = filtered.map(a => [
      a.asset_number, a.name, CATEGORY_META[a.category].label, a.status,
      a.purchase_date, a.cost_ngn, bookValue(a).toFixed(2), totalDepreciation(a).toFixed(2),
      nameOf(a.assigned_to), a.insurance_expiry ?? '',
    ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `assets-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const totalCost = assets.filter(a => a.status === 'active').reduce((s, a) => s + a.cost_ngn, 0);
  const totalBookValue = assets.filter(a => a.status === 'active').reduce((s, a) => s + bookValue(a), 0);
  const totalDepn = totalCost - totalBookValue;
  const insuranceExpiring = assets.filter(a => a.status === 'active' && a.insurance_expiry && differenceInDays(parseISO(a.insurance_expiry), new Date()) <= 30 && differenceInDays(parseISO(a.insurance_expiry), new Date()) >= 0).length;

  const nameOf = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? 'Unknown') : '—';
  const f = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <AuroraHero className="p-5 sm:p-6" pattern="contour">
        <PageHeader
          className="mb-0"
          title="Asset Register"
          description="Track fixed assets, depreciation, and insurance."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export</Button>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Asset</Button>
            </div>
          }
        />
      </AuroraHero>

      {/* Stats */}
      <div className="kd-stat-grid">
        <StatCard title="Total cost (active)" value={formatNaira(totalCost)} icon={Package} tone="primary" />
        <StatCard title="Net book value" value={formatNaira(totalBookValue)} icon={CheckCircle2} tone="success" />
        <StatCard title="Total depreciation" value={formatNaira(totalDepn)} icon={TrendingDown} tone="default" />
        <StatCard title="Insurance expiring ≤30d" value={insuranceExpiring} icon={AlertTriangle} tone="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search assets…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="disposed">Disposed</TabsTrigger>
            <TabsTrigger value="written_off">Written Off</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card">
          <EmptyState icon={Package} title="No assets found" description="Add your first asset above to start tracking depreciation, custody and insurance." />
        </div>
      ) : (
        <>
        <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 bg-muted/40">
              <tr>
                {['Asset', 'Category', 'Purchase Date', 'Cost', 'Book Value', 'Deprecn', 'Assigned', 'Insurance', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map(a => {
                const bv = bookValue(a);
                const depn = totalDepreciation(a);
                const depnPct = a.cost_ngn > 0 ? (depn / a.cost_ngn) * 100 : 0;
                return (
                  <tr key={a.id} className="hover:bg-muted/40 kd-transition">
                    <td className="px-3 py-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">{a.asset_number}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{CATEGORY_META[a.category].label}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(parseISO(a.purchase_date), 'd MMM yyyy')}
                    </td>
                    <td className="px-3 py-3 text-xs font-medium currency">{formatNaira(a.cost_ngn)}</td>
                    <td className="px-3 py-3 text-xs font-medium text-success currency">{formatNaira(bv)}</td>
                    <td className="px-3 py-3">
                      <p className="text-xs text-muted-foreground currency">{formatNaira(depn)}</p>
                      <p className="text-[10px] text-muted-foreground/60">{depnPct.toFixed(0)}%</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {a.assigned_to ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />{nameOf(a.assigned_to)}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3 space-y-1">
                      {a.insurance_expiry && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{format(parseISO(a.insurance_expiry), 'd MMM yy')}</span>
                        </div>
                      )}
                      {insuranceExpiryBadge(a.insurance_expiry)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_BADGE[a.status].variant} className="text-[10px]">
                        {STATUS_BADGE[a.status].label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => setDeleteTarget(a)}>
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
          {filtered.map(a => {
            const bv = bookValue(a);
            const depn = totalDepreciation(a);
            return (
              <MobileCard key={a.id}>
                <MobileCardHeader>
                  <div className="min-w-0 flex-1">
                    <MobileCardTitle>{a.name}</MobileCardTitle>
                    <p className="text-[11px] text-muted-foreground">{a.asset_number}</p>
                  </div>
                  <MobileCardMeta>
                    <Badge variant={STATUS_BADGE[a.status].variant} className="text-[10px]">
                      {STATUS_BADGE[a.status].label}
                    </Badge>
                  </MobileCardMeta>
                </MobileCardHeader>

                <MobileCardRow label="Category">{CATEGORY_META[a.category].label}</MobileCardRow>
                <MobileCardRow label="Purchase date">{format(parseISO(a.purchase_date), 'd MMM yyyy')}</MobileCardRow>
                <MobileCardRow label="Cost">{formatNaira(a.cost_ngn)}</MobileCardRow>
                <MobileCardRow label="Book value"><span className="text-success currency">{formatNaira(bv)}</span></MobileCardRow>
                <MobileCardRow label="Depreciation">{formatNaira(depn)}</MobileCardRow>
                <MobileCardRow label="Assigned">{a.assigned_to ? nameOf(a.assigned_to) : '—'}</MobileCardRow>
                {a.insurance_expiry && (
                  <MobileCardRow label="Insurance">
                    <span className="inline-flex items-center gap-1.5">
                      {format(parseISO(a.insurance_expiry), 'd MMM yy')}
                      {insuranceExpiryBadge(a.insurance_expiry)}
                    </span>
                  </MobileCardRow>
                )}

                <MobileCardFooter>
                  <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4 mr-1.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setDeleteTarget(a)}>
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                  </Button>
                </MobileCardFooter>
              </MobileCard>
            );
          })}
        </div>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
            <DialogDescription>Depreciation and CITA allowance rates are pre-filled by category and can be adjusted.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Asset name *</Label>
              <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Dell Latitude 5520, Toyota Corolla" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => onCategoryChange(v as Category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => f('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                  <SelectItem value="written_off">Written Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Purchase date *</Label>
              <Input type="date" value={form.purchase_date} onChange={e => f('purchase_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cost (₦) *</Label>
              <Input type="number" min={0} value={form.cost_ngn} onChange={e => f('cost_ngn', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Useful life (years)</Label>
              <Input type="number" min={1} value={form.useful_life_years} onChange={e => f('useful_life_years', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Salvage value (₦)</Label>
              <Input type="number" min={0} value={form.salvage_value_ngn} onChange={e => f('salvage_value_ngn', e.target.value)} />
            </div>

            <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">CITA Capital Allowance Rates</p></div>
            <div className="space-y-1.5">
              <Label>Initial allowance (%)</Label>
              <Input type="number" min={0} max={100} value={form.initial_allowance_rate} onChange={e => f('initial_allowance_rate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Annual allowance (%)</Label>
              <Input type="number" min={0} max={100} value={form.annual_allowance_rate} onChange={e => f('annual_allowance_rate', e.target.value)} />
            </div>

            <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Custody</p></div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <Select value={form.assigned_to} onValueChange={v => f('assigned_to', v)}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department_id} onValueChange={v => f('department_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location} onChange={e => f('location', e.target.value)} placeholder="e.g. Head Office — Floor 2" />
            </div>

            <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Insurance</p></div>
            <div className="space-y-1.5">
              <Label>Insurer</Label>
              <Input value={form.insurer} onChange={e => f('insurer', e.target.value)} placeholder="e.g. Leadway Assurance" />
            </div>
            <div className="space-y-1.5">
              <Label>Policy number</Label>
              <Input value={form.insurance_policy_number} onChange={e => f('insurance_policy_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Insurance expiry</Label>
              <Input type="date" value={form.insurance_expiry} onChange={e => f('insurance_expiry', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Insured value (₦)</Label>
              <Input type="number" min={0} value={form.insurance_value_ngn} onChange={e => f('insurance_value_ngn', e.target.value)} />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Add asset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The asset will be hidden from all lists but kept in the database for audit purposes.</AlertDialogDescription>
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
