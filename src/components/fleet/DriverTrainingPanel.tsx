import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { formatDate } from '@/lib/format';
import { Loader2, Plus, GraduationCap, AlertTriangle, CheckCircle, Clock, Award } from 'lucide-react';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';

interface TrainingRecord {
  id: string;
  driver_id: string;
  training_type: string;
  custom_type: string | null;
  provider: string | null;
  certificate_url: string | null;
  training_date: string;
  expiry_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  driver?: { full_name: string | null } | null;
}

interface Props {
  staff: Array<{ id: string; full_name: string }>;
}

const TRAINING_TYPES = [
  { value: 'defensive_driving', label: 'Defensive Driving' },
  { value: 'first_aid', label: 'First Aid' },
  { value: 'fire_safety', label: 'Fire Safety' },
  { value: 'hazmat', label: 'Hazardous Materials' },
  { value: 'vehicle_handling', label: 'Vehicle Handling' },
  { value: 'customer_service', label: 'Customer Service' },
  { value: 'road_safety', label: 'Road Safety (FRSC)' },
  { value: 'speed_limiter', label: 'Speed Limiter Operation' },
  { value: 'custom', label: 'Custom / Other' },
];

function trainingLabel(type: string, custom: string | null) {
  const found = TRAINING_TYPES.find((t) => t.value === type);
  if (type === 'custom' && custom) return custom;
  return found?.label || type;
}

function statusBadge(status: string, expiryDate: string | null) {
  if (expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDate);
    exp.setHours(0, 0, 0, 0);
    const days = Math.ceil((exp.getTime() - today.getTime()) / (86400000));
    if (days < 0) return <Badge variant="destructive">Expired</Badge>;
    if (days <= 30) return <Badge className="bg-amber-500 text-white">Expiring ({days}d)</Badge>;
  }
  if (status === 'valid') return <Badge className="bg-green-600 text-white">Valid</Badge>;
  if (status === 'expired') return <Badge variant="destructive">Expired</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export function DriverTrainingPanel({ staff }: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'finance' || profile?.role === 'operations';

  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasTable, setHasTable] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterDriver, setFilterDriver] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const [form, setForm] = useState({
    driver_id: '',
    training_type: 'defensive_driving',
    custom_type: '',
    provider: '',
    training_date: new Date().toISOString().slice(0, 10),
    expiry_date: '',
    notes: '',
  });

  async function fetchRecords() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('driver_training_records')
        .select('*, driver:profiles!driver_id(full_name)')
        .order('training_date', { ascending: false });
      if (error) throw error;
      setRecords(data || []);
      setHasTable(true);
    } catch {
      setHasTable(false);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRecords(); }, []);

  async function handleAdd() {
    if (!form.driver_id || !form.training_date) return;
    setSubmitting(true);
    try {
      const insert: any = {
        driver_id: form.driver_id,
        training_type: form.training_type,
        custom_type: form.training_type === 'custom' ? form.custom_type : null,
        provider: form.provider || null,
        training_date: form.training_date,
        expiry_date: form.expiry_date || null,
        status: form.expiry_date ? 'valid' : 'valid',
        notes: form.notes || null,
        created_by: profile?.id,
      };
      const { error } = await supabase.from('driver_training_records').insert(insert);
      if (error) throw error;
      toast({ title: 'Training record added' });
      setShowAdd(false);
      setForm({ driver_id: '', training_type: 'defensive_driving', custom_type: '', provider: '', training_date: new Date().toISOString().slice(0, 10), expiry_date: '', notes: '' });
      fetchRecords();
    } catch (err: unknown) {
      toast({ title: 'Failed to add', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = records.filter((r) => {
    if (filterDriver !== 'all' && r.driver_id !== filterDriver) return false;
    if (filterType !== 'all' && r.training_type !== filterType) return false;
    return true;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalValid = records.filter((r) => {
    if (!r.expiry_date) return r.status === 'valid';
    return new Date(r.expiry_date) >= today;
  }).length;
  const totalExpired = records.filter((r) => {
    if (r.expiry_date) return new Date(r.expiry_date) < today;
    return r.status === 'expired';
  }).length;
  const expiringSoon = records.filter((r) => {
    if (!r.expiry_date) return false;
    const exp = new Date(r.expiry_date);
    const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  const uniqueDrivers = new Set(records.map((r) => r.driver_id));

  if (!hasTable) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Driver training module requires the latest migration. Deploy the <code>fleet_incidents_lifecycle_training</code> migration to enable this feature.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{records.length}</div>
            <p className="text-xs text-muted-foreground">{uniqueDrivers.size} driver{uniqueDrivers.size !== 1 ? 's' : ''} trained</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Valid</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalValid}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{expiringSoon}</div>
            <p className="text-xs text-muted-foreground">Within 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalExpired}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-2">
          <Select value={filterDriver} onValueChange={setFilterDriver}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All drivers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Drivers</SelectItem>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TRAINING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Training Record
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Award} title="No training records" description="Add training records to track driver certifications and compliance." />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Training</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm">
                    {(r.driver as any)?.full_name || staff.find((s) => s.id === r.driver_id)?.full_name || 'Unknown'}
                  </TableCell>
                  <TableCell className="text-sm">{trainingLabel(r.training_type, r.custom_type)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.provider || '—'}</TableCell>
                  <TableCell className="text-sm">{formatDate(r.training_date)}</TableCell>
                  <TableCell className="text-sm">{r.expiry_date ? formatDate(r.expiry_date) : 'No expiry'}</TableCell>
                  <TableCell>{statusBadge(r.status, r.expiry_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> Add Training Record
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Driver <span className="text-destructive">*</span></Label>
              <Select value={form.driver_id || undefined} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Training Type <span className="text-destructive">*</span></Label>
              <Select value={form.training_type} onValueChange={(v) => setForm({ ...form, training_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRAINING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.training_type === 'custom' && (
                <Input placeholder="Describe training type" value={form.custom_type} onChange={(e) => setForm({ ...form, custom_type: e.target.value })} />
              )}
            </div>

            <div className="space-y-1">
              <Label>Provider</Label>
              <Input placeholder="e.g. FRSC, Lagos Driving School" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Training Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.training_date} onChange={(e) => setForm({ ...form, training_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional details..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting || !form.driver_id || !form.training_date}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
