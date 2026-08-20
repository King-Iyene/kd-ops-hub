import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { Loader2, Pencil, TrendingDown, Car, DollarSign, Calendar } from 'lucide-react';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';

interface VehicleLifecycle {
  id: string;
  name: string;
  plate_number: string;
  make_model: string | null;
  year: number | null;
  purchase_price_ngn: number | null;
  purchase_date: string | null;
  depreciation_method: string | null;
  salvage_value_ngn: number | null;
  useful_life_years: number | null;
  financing_type: string | null;
  lease_monthly_ngn: number | null;
  lease_end_date: string | null;
  fuel_type: string | null;
  insurance_policy_number: string | null;
  insurance_provider: string | null;
  insurance_premium_ngn: number | null;
  insurance_type: string | null;
  insurance_expiry: string | null;
  total_mileage_km: number | null;
  status: string | null;
}

interface Props {
  onRefresh?: () => void;
}

function computeDepreciation(v: VehicleLifecycle): { currentValue: number; yearlyDep: number; totalDep: number } | null {
  if (!v.purchase_price_ngn || !v.purchase_date || !v.useful_life_years) return null;
  const purchaseDate = new Date(v.purchase_date);
  const now = new Date();
  const yearsOwned = Math.max(0, (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const salvage = v.salvage_value_ngn || 0;

  if (v.depreciation_method === 'declining_balance') {
    const rate = 1 - Math.pow(salvage / v.purchase_price_ngn, 1 / v.useful_life_years);
    const currentValue = Math.max(salvage, v.purchase_price_ngn * Math.pow(1 - rate, yearsOwned));
    const yearlyDep = currentValue * rate;
    return { currentValue, yearlyDep, totalDep: v.purchase_price_ngn - currentValue };
  }

  const yearlyDep = (v.purchase_price_ngn - salvage) / v.useful_life_years;
  const totalDep = Math.min(v.purchase_price_ngn - salvage, yearlyDep * yearsOwned);
  const currentValue = Math.max(salvage, v.purchase_price_ngn - totalDep);
  return { currentValue, yearlyDep, totalDep };
}

const LIFECYCLE_COLS = [
  'id','name','plate_number','make_model','year','purchase_price_ngn','purchase_date',
  'depreciation_method','salvage_value_ngn','useful_life_years','financing_type',
  'lease_monthly_ngn','lease_end_date','fuel_type','insurance_policy_number',
  'insurance_provider','insurance_premium_ngn','insurance_type','insurance_expiry',
  'total_mileage_km','status',
].join(',');

export function VehicleLifecyclePanel({ onRefresh }: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'finance' || profile?.role === 'operations';

  const [vehicles, setVehicles] = useState<VehicleLifecycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLifecycleCols, setHasLifecycleCols] = useState(true);
  const [editVehicle, setEditVehicle] = useState<VehicleLifecycle | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    purchase_price_ngn: '',
    purchase_date: '',
    depreciation_method: 'straight_line',
    salvage_value_ngn: '',
    useful_life_years: '5',
    financing_type: 'owned',
    lease_monthly_ngn: '',
    lease_end_date: '',
    fuel_type: 'pms',
    insurance_policy_number: '',
    insurance_provider: '',
    insurance_premium_ngn: '',
    insurance_type: 'third_party',
  });

  async function fetchVehicles() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('vehicles').select(LIFECYCLE_COLS).order('name').limit(2000);
      if (error) throw error;
      setVehicles((data || []) as VehicleLifecycle[]);
      setHasLifecycleCols(true);
    } catch {
      try {
        const { data } = await supabase.from('vehicles')
          .select('id,name,plate_number,make_model,year,insurance_expiry,total_mileage_km,status')
          .order('name')
          .limit(2000);
        setVehicles((data || []).map((v: any) => ({ ...v, purchase_price_ngn: null, purchase_date: null, depreciation_method: null, salvage_value_ngn: null, useful_life_years: null, financing_type: null, lease_monthly_ngn: null, lease_end_date: null, fuel_type: null, insurance_policy_number: null, insurance_provider: null, insurance_premium_ngn: null, insurance_type: null })));
        setHasLifecycleCols(false);
      } catch {
        setVehicles([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchVehicles(); }, []);

  function openEdit(v: VehicleLifecycle) {
    setEditVehicle(v);
    setForm({
      purchase_price_ngn: v.purchase_price_ngn?.toString() || '',
      purchase_date: v.purchase_date || '',
      depreciation_method: v.depreciation_method || 'straight_line',
      salvage_value_ngn: v.salvage_value_ngn?.toString() || '',
      useful_life_years: v.useful_life_years?.toString() || '5',
      financing_type: v.financing_type || 'owned',
      lease_monthly_ngn: v.lease_monthly_ngn?.toString() || '',
      lease_end_date: v.lease_end_date || '',
      fuel_type: v.fuel_type || 'pms',
      insurance_policy_number: v.insurance_policy_number || '',
      insurance_provider: v.insurance_provider || '',
      insurance_premium_ngn: v.insurance_premium_ngn?.toString() || '',
      insurance_type: v.insurance_type || 'third_party',
    });
  }

  async function handleSave() {
    if (!editVehicle) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        purchase_price_ngn: form.purchase_price_ngn ? parseFloat(form.purchase_price_ngn) : null,
        purchase_date: form.purchase_date || null,
        depreciation_method: form.depreciation_method,
        salvage_value_ngn: form.salvage_value_ngn ? parseFloat(form.salvage_value_ngn) : 0,
        useful_life_years: form.useful_life_years ? parseInt(form.useful_life_years) : 5,
        financing_type: form.financing_type,
        lease_monthly_ngn: form.lease_monthly_ngn ? parseFloat(form.lease_monthly_ngn) : null,
        lease_end_date: form.lease_end_date || null,
        fuel_type: form.fuel_type,
        insurance_policy_number: form.insurance_policy_number || null,
        insurance_provider: form.insurance_provider || null,
        insurance_premium_ngn: form.insurance_premium_ngn ? parseFloat(form.insurance_premium_ngn) : null,
        insurance_type: form.insurance_type,
      };
      const { error } = await supabase.from('vehicles').update(updates).eq('id', editVehicle.id);
      if (error) throw error;
      toast({ title: `${editVehicle.plate_number} lifecycle updated` });
      setEditVehicle(null);
      fetchVehicles();
      onRefresh?.();
    } catch (err: any) {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const totalFleetValue = vehicles.reduce((sum, v) => {
    const dep = computeDepreciation(v);
    return sum + (dep?.currentValue || 0);
  }, 0);

  const totalInsurancePremium = vehicles.reduce((sum, v) => sum + (v.insurance_premium_ngn || 0), 0);

  const vehiclesWithCost = vehicles.filter((v) => v.purchase_price_ngn);

  const totalDepreciation = vehicles.reduce((sum, v) => {
    const dep = computeDepreciation(v);
    return sum + (dep?.yearlyDep || 0);
  }, 0);

  const fuelTypes = { pms: 0, ago: 0, lpg: 0 };
  vehicles.forEach((v) => {
    const ft = (v.fuel_type || 'pms') as keyof typeof fuelTypes;
    if (ft in fuelTypes) fuelTypes[ft]++;
  });

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      {!hasLifecycleCols && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Vehicle lifecycle columns have not been deployed yet. Run the latest migration to enable purchase price, depreciation, and insurance tracking.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fleet Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold currency">{totalFleetValue > 0 ? formatNaira(totalFleetValue) : '—'}</div>
            <p className="text-xs text-muted-foreground">{vehiclesWithCost.length} of {vehicles.length} vehicles valued</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Annual Depreciation</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 currency">{totalDepreciation > 0 ? formatNaira(totalDepreciation) : '—'}</div>
            <p className="text-xs text-muted-foreground">Per year across fleet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Insurance Premiums</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 currency">{totalInsurancePremium > 0 ? formatNaira(totalInsurancePremium) : '—'}</div>
            <p className="text-xs text-muted-foreground">Total annual premiums</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fuel Mix</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {fuelTypes.pms > 0 && <Badge className="bg-green-600 text-white">PMS {fuelTypes.pms}</Badge>}
              {fuelTypes.ago > 0 && <Badge className="bg-amber-600 text-white">AGO {fuelTypes.ago}</Badge>}
              {fuelTypes.lpg > 0 && <Badge className="bg-blue-600 text-white">LPG {fuelTypes.lpg}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Petrol / Diesel / Gas</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Fuel Type</TableHead>
              <TableHead>Purchase Price</TableHead>
              <TableHead>Current Value</TableHead>
              <TableHead>Financing</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>Mileage</TableHead>
              {isAdmin && <TableHead className="w-10"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((v) => {
              const dep = computeDepreciation(v);
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    <div>{v.name}</div>
                    <div className="text-xs text-muted-foreground">{v.plate_number}{v.make_model ? ` · ${v.make_model}` : ''}{v.year ? ` (${v.year})` : ''}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      v.fuel_type === 'ago' ? 'border-amber-500 text-amber-700' :
                      v.fuel_type === 'lpg' ? 'border-blue-500 text-blue-700' :
                      'border-green-500 text-green-700'
                    }>
                      {(v.fuel_type || 'pms').toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm currency">
                    {v.purchase_price_ngn ? formatNaira(v.purchase_price_ngn) : '—'}
                    {v.purchase_date && <div className="text-xs text-muted-foreground">{new Date(v.purchase_date).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dep ? (
                      <>
                        <div className="font-medium currency">{formatNaira(dep.currentValue)}</div>
                        <div className="text-xs text-red-500 currency">-{formatNaira(dep.totalDep)} dep.</div>
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {(v.financing_type || 'owned').replace('_', ' ')}
                    </Badge>
                    {v.financing_type === 'leased' && v.lease_monthly_ngn && (
                      <div className="text-xs text-muted-foreground mt-0.5 currency">{formatNaira(v.lease_monthly_ngn)}/mo</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.insurance_provider ? (
                      <>
                        <div>{v.insurance_provider}</div>
                        <div className="text-xs text-muted-foreground currency">
                          {v.insurance_type === 'comprehensive' ? 'Comprehensive' : '3rd Party'}
                          {v.insurance_premium_ngn ? ` · ${formatNaira(v.insurance_premium_ngn)}` : ''}
                        </div>
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.total_mileage_km != null ? `${Number(v.total_mileage_km).toLocaleString()} km` : '—'}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit" onClick={() => openEdit(v)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editVehicle} onOpenChange={(open) => { if (!open) setEditVehicle(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
            <DialogTitle>Vehicle Lifecycle — {editVehicle?.plate_number}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Acquisition</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Purchase Price</Label>
                  <Input type="number" placeholder="0" value={form.purchase_price_ngn} onChange={(e) => setForm({ ...form, purchase_price_ngn: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Purchase Date</Label>
                  <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Financing</Label>
                  <Select value={form.financing_type} onValueChange={(v) => setForm({ ...form, financing_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owned">Owned</SelectItem>
                      <SelectItem value="leased">Leased</SelectItem>
                      <SelectItem value="financed">Financed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Fuel Type</Label>
                  <Select value={form.fuel_type} onValueChange={(v) => setForm({ ...form, fuel_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pms">PMS (Petrol)</SelectItem>
                      <SelectItem value="ago">AGO (Diesel)</SelectItem>
                      <SelectItem value="lpg">LPG (Gas)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.financing_type === 'leased' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label>Monthly Lease</Label>
                    <Input type="number" placeholder="0" value={form.lease_monthly_ngn} onChange={(e) => setForm({ ...form, lease_monthly_ngn: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Lease End Date</Label>
                    <Input type="date" value={form.lease_end_date} onChange={(e) => setForm({ ...form, lease_end_date: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Depreciation</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Method</Label>
                  <Select value={form.depreciation_method} onValueChange={(v) => setForm({ ...form, depreciation_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight_line">Straight Line</SelectItem>
                      <SelectItem value="declining_balance">Declining Balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Salvage Value</Label>
                  <Input type="number" placeholder="0" value={form.salvage_value_ngn} onChange={(e) => setForm({ ...form, salvage_value_ngn: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Useful Life (yrs)</Label>
                  <Input type="number" placeholder="5" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })} />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Insurance</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Provider</Label>
                  <Input placeholder="e.g. Leadway, AXA Mansard" value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Policy Number</Label>
                  <Input placeholder="Policy #" value={form.insurance_policy_number} onChange={(e) => setForm({ ...form, insurance_policy_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Coverage Type</Label>
                  <Select value={form.insurance_type} onValueChange={(v) => setForm({ ...form, insurance_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="third_party">Third Party</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Annual Premium</Label>
                  <Input type="number" placeholder="0" value={form.insurance_premium_ngn} onChange={(e) => setForm({ ...form, insurance_premium_ngn: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 px-6 pb-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setEditVehicle(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
