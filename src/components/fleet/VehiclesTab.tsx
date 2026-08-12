import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatDate } from '@/lib/format';
import { notifyUser } from '@/lib/notify';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { FilePreviewTrigger } from '@/components/FilePreview';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { VehicleInspectionForm } from '@/components/fleet/VehicleInspectionForm';
import { Loader2, Plus, Car, Pencil, Trash2, AlertTriangle, Wrench, FileText, History, User, Fuel, Ban, CalendarOff, CheckSquare, ClipboardCheck } from 'lucide-react';
import { type FieldStaff, type Vehicle, type MaintenanceRecord } from '@/lib/fleet-utils';
import { SERVICE_TYPES } from '@/components/fleet/FleetAnalyticsDashboard';

function FuelGauge({ tank, current, lastRefuel }: { tank: number; current: number; lastRefuel: string | null }) {
  const cap = tank || 60;
  const cur = Math.min(current || 0, cap);
  const pct = cap > 0 ? Math.round((cur / cap) * 100) : 0;
  const isCritical = pct < 10;
  const barColor = pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct >= 50 ? 'text-green-700' : pct >= 25 ? 'text-amber-600' : 'text-red-600';
  const daysSince = lastRefuel
    ? Math.floor((Date.now() - new Date(lastRefuel).getTime()) / 86_400_000)
    : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${textColor}`}>
          {pct}% — {cur.toFixed(0)}L remaining of {cap}L
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}${isCritical ? ' animate-pulse' : ''}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      {daysSince !== null && (
        <p className="text-[10px] text-muted-foreground">
          Last filled {daysSince === 0 ? 'today' : `${daysSince}d ago`}
        </p>
      )}
      {isCritical && (
        <p className="text-[10px] text-red-600 font-medium flex items-center gap-0.5 animate-pulse">
          <AlertTriangle className="h-2.5 w-2.5" /> Critical — may be empty
        </p>
      )}
      {!isCritical && pct < 25 && (
        <p className="text-[10px] text-red-600 font-medium flex items-center gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" /> Low fuel
        </p>
      )}
    </div>
  );
}

interface FuelLevelLog {
  id: string;
  vehicle_id: string;
  event_type: 'trip_consumed' | 'fuel_added';
  amount_litres: number;
  resulting_level_litres: number;
  reference_id: string | null;
  created_at: string;
}

function FuelHistoryDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [logs, setLogs] = useState<FuelLevelLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    supabase
      .from('fuel_level_logs')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .gte('created_at', since)
      .order('created_at')
      .then(({ data }) => {
        setLogs((data as FuelLevelLog[]) || []);
        setLoading(false);
      });
  }, [vehicle.id]);

  const chartData = logs.map((l) => ({
    date: new Date(l.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    level: parseFloat(l.resulting_level_litres.toFixed(1)),
    type: l.event_type,
  }));

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fuel history — {vehicle.name} ({vehicle.plate_number})</DialogTitle>
          <DialogDescription>Last 30 days of fuel level changes</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No fuel level changes recorded in the last 30 days.</p>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis unit="L" domain={[0, vehicle.tank_capacity_litres || 60]} tick={{ fontSize: 11 }} />
                <ReTooltip formatter={(v: number) => [`${v}L`, 'Fuel level']} />
                <Line
                  type="monotone"
                  dataKey="level"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const fill = payload.type === 'fuel_added' ? '#22c55e' : '#ef4444';
                    return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={fill} stroke="white" strokeWidth={1.5} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> Fuel added</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Trip consumed</span>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Event</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-right px-3 py-2">Level after</th>
                  </tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{new Date(l.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-3 py-1.5">
                        {l.event_type === 'fuel_added'
                          ? <span className="text-green-600 font-medium">Fuel added</span>
                          : <span className="text-red-600 font-medium">Trip consumed</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">{l.event_type === 'fuel_added' ? '+' : '−'}{l.amount_litres.toFixed(1)}L</td>
                      <td className="px-3 py-1.5 text-right font-medium">{l.resulting_level_litres.toFixed(1)}L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyVehicleForm = {
  name: '',
  plate_number: '',
  make_model: '',
  year: '',
  color: '',
  vin: '',
  assigned_driver_id: '',
  weekly_budget_ngn: '',
  tank_capacity_litres: '60',
  avg_km_per_litre: '10',
  insurance_expiry: '',
  road_worthiness_expiry: '',
  last_service_date: '',
  next_service_date: '',
  notes: '',
};

function VehiclesTab({ staff }: { staff: FieldStaff[] }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'finance';
  const canManageVehicles = isAdmin; // edit / delete require admin
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyVehicleForm);
  const [submitting, setSubmitting] = useState(false);
  const [allEmployees, setAllEmployees] = useState<FieldStaff[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [nonAdminConfirmed, setNonAdminConfirmed] = useState(false);
  const [viewingFuelHistory, setViewingFuelHistory] = useState<Vehicle | null>(null);
  const [viewingMaintenance, setViewingMaintenance] = useState<Vehicle | null>(null);
  const [settingOutOfService, setSettingOutOfService] = useState<Vehicle | null>(null);
  const [outOfServiceDate, setOutOfServiceDate] = useState('');
  const [inspectingVehicle, setInspectingVehicle] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, dRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('name'),
        supabase
          .from('profiles_directory')
          .select('id, full_name, email')
          .in('role', ['field_staff', 'driver', 'operations'])
          .eq('status', 'active')
          .order('full_name'),
      ]);
      setVehicles((vRes.data as Vehicle[]) || []);
      setAllEmployees((dRes.data as FieldStaff[]) || []);
    } catch (err) {
      console.error('[Fleet] VehiclesTab load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setForm(emptyVehicleForm);
    setNonAdminConfirmed(false);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      name: v.name,
      plate_number: v.plate_number,
      make_model: v.make_model || '',
      year: v.year ? String(v.year) : '',
      color: v.color || '',
      vin: v.vin || '',
      assigned_driver_id: v.assigned_driver_id || '',
      weekly_budget_ngn: String(v.weekly_budget_ngn || 0),
      tank_capacity_litres: String(v.tank_capacity_litres || 60),
      avg_km_per_litre: String(v.avg_km_per_litre || 10),
      insurance_expiry: v.insurance_expiry || '',
      road_worthiness_expiry: v.road_worthiness_expiry || '',
      last_service_date: v.last_service_date || '',
      next_service_date: v.next_service_date || '',
      notes: v.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.plate_number.trim()) {
      toast({ title: 'Name and plate number are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      plate_number: form.plate_number.trim().toUpperCase(),
      make_model: form.make_model.trim() || null,
      year: parseInt(form.year) || null,
      color: form.color.trim() || null,
      vin: form.vin.trim() || null,
      assigned_driver_id: form.assigned_driver_id || null,
      weekly_budget_ngn: parseFloat(form.weekly_budget_ngn) || 0,
      tank_capacity_litres: parseFloat(form.tank_capacity_litres) || 60,
      avg_km_per_litre: parseFloat(form.avg_km_per_litre) || 10,
      insurance_expiry: form.insurance_expiry || null,
      road_worthiness_expiry: form.road_worthiness_expiry || null,
      last_service_date: form.last_service_date || null,
      next_service_date: form.next_service_date || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editing) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('fleet_vehicle_updated', `Vehicle "${payload.name}" (${payload.plate_number}) updated`, profile);
        toast({ title: 'Vehicle updated' });
      } else {
        const { error } = await supabase.from('vehicles').insert({ ...payload, status: 'active' });
        if (error) throw error;
        await logAudit('fleet_vehicle_added', `Vehicle "${payload.name}" (${payload.plate_number}) added`, profile);
        toast({ title: 'Vehicle added' });
      }
      setShowForm(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (v: Vehicle) => {
    const next = v.status === 'active' ? 'inactive' : 'active';
    await supabase.from('vehicles').update({ status: next }).eq('id', v.id);
    await logAudit(
      next === 'inactive' ? 'fleet_vehicle_deactivated' : 'fleet_vehicle_updated',
      `Vehicle "${v.name}" ${next === 'inactive' ? 'deactivated' : 'reactivated'}`,
      profile,
    );
    toast({ title: `Vehicle ${next}` });
    load();
  };

  const handleDelete = async (v: Vehicle) => {
    const { error } = await supabase.from('vehicles').delete().eq('id', v.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fleet_vehicle_deleted', `Vehicle "${v.name}" (${v.plate_number}) deleted`, profile);
    toast({ title: 'Vehicle deleted' });
    load();
  };

  const employeeName = (id: string | null) => {
    if (!id) return '—';
    const d = allEmployees.find((s) => s.id === id) || staff.find((s) => s.id === id);
    return d?.full_name || '(unassigned)';
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const isOutOfService = (v: Vehicle) => {
    if (!v.out_of_service_until) return false;
    return v.out_of_service_until >= new Date().toISOString().slice(0, 10);
  };

  const handleMarkOutOfService = async () => {
    if (!settingOutOfService) return;
    const { error } = await supabase
      .from('vehicles')
      .update({ out_of_service_until: outOfServiceDate || null })
      .eq('id', settingOutOfService.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (outOfServiceDate && settingOutOfService.assigned_driver_id) {
      await notifyUser({
        userId: settingOutOfService.assigned_driver_id,
        type: 'vehicle_out_of_service',
        module: 'fleet',
        priority: 'high',
        title: `${settingOutOfService.plate_number} is out of service`,
        body: `${settingOutOfService.name} (${settingOutOfService.plate_number}) has been marked out of service until ${formatDate(outOfServiceDate)}.`,
      });
    }
    toast({ title: outOfServiceDate ? 'Vehicle marked out of service' : 'Vehicle returned to service' });
    setSettingOutOfService(null);
    setOutOfServiceDate('');
    load();
  };

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered
          </p>
          <Button onClick={() => { reset(); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Vehicle
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Assigned Employee</TableHead>
                  <TableHead>Fuel Level</TableHead>
                  <TableHead className="text-right">Weekly Budget</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead>Road Worthiness</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                      No vehicles registered yet. Add your first vehicle to start tracking.
                    </TableCell>
                  </TableRow>
                )}
                {vehicles.map((v) => (
                  <TableRow key={v.id} className={`kd-transition${isOutOfService(v) ? ' bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {v.name}
                        {isOutOfService(v) && (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive border border-destructive/20 text-xs">
                            <Ban className="h-3 w-3 mr-1" /> Out of Service
                          </Badge>
                        )}
                      </div>
                      {v.make_model && (
                        <div className="text-xs text-muted-foreground">
                          {v.make_model}{v.year ? ` (${v.year})` : ''}{v.color ? ` · ${v.color}` : ''}
                        </div>
                      )}
                      {isOutOfService(v) && v.out_of_service_until && (
                        <div className="text-xs text-destructive mt-0.5">Until {formatDate(v.out_of_service_until)}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{v.plate_number}</TableCell>
                    <TableCell className="text-sm">{employeeName(v.assigned_driver_id)}</TableCell>
                    <TableCell className="min-w-[140px]">
                      <FuelGauge
                        tank={v.tank_capacity_litres}
                        current={v.current_fuel_litres}
                        lastRefuel={v.last_refuel_at}
                      />
                    </TableCell>
                    <TableCell className="text-right currency">{formatNaira(v.weekly_budget_ngn)}</TableCell>
                    <TableCell>
                      {v.insurance_expiry ? (
                        <Badge
                          variant="secondary"
                          className={
                            isExpired(v.insurance_expiry)
                              ? 'bg-destructive/10 text-destructive'
                              : isExpiringSoon(v.insurance_expiry)
                              ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success'
                          }
                        >
                          {formatDate(v.insurance_expiry)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.road_worthiness_expiry ? (
                        <Badge
                          variant="secondary"
                          className={
                            isExpired(v.road_worthiness_expiry)
                              ? 'bg-destructive/10 text-destructive'
                              : isExpiringSoon(v.road_worthiness_expiry)
                              ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success'
                          }
                        >
                          {formatDate(v.road_worthiness_expiry)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          v.status === 'active'
                            ? `bg-success/10 text-success${canManageVehicles ? ' cursor-pointer' : ''}`
                            : `bg-muted text-muted-foreground${canManageVehicles ? ' cursor-pointer' : ''}`
                        }
                        onClick={canManageVehicles ? () => toggleStatus(v) : undefined}
                      >
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" title="Fuel history" onClick={() => setViewingFuelHistory(v)}>
                          <History className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Maintenance schedule" onClick={() => setViewingMaintenance(v)}>
                          <Wrench className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Run inspection" onClick={() => setInspectingVehicle(v)}>
                          <ClipboardCheck className="h-4 w-4" />
                        </Button>
                        {canManageVehicles && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={isOutOfService(v) ? 'Return to service' : 'Mark out of service'}
                              onClick={() => { setSettingOutOfService(v); setOutOfServiceDate(v.out_of_service_until || ''); }}
                            >
                              <CalendarOff className={`h-4 w-4 ${isOutOfService(v) ? 'text-destructive' : ''}`} />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(v)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); reset(); } }}>
        <DialogContent className="max-w-2xl p-0 max-h-[90vh] flex flex-col gap-0">
          {/* Header — adds a TOD halo behind the icon */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="pointer-events-none absolute inset-0 rounded-xl bg-[hsl(var(--tod-glow))] opacity-15 blur-md" />
                <Car className="relative h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="kd-display text-lg">{editing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editing ? `Updating ${form.name || 'this vehicle'}` : 'Register a new company vehicle'}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="overflow-y-auto px-6 py-5 space-y-7 flex-1 min-h-0">
            {/* Identity */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Identity</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office Hilux" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Plate number <span className="text-destructive">*</span></Label>
                  <Input value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} placeholder="e.g. LAG-123-AB" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Make / model</Label>
                  <Input value={form.make_model} onChange={(e) => setForm({ ...form, make_model: e.target.value })} placeholder="e.g. Toyota Hilux" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Year</Label>
                  <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2022" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. White" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">VIN</Label>
                  <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Fuel */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Fuel & efficiency</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tank capacity (litres)</Label>
                  <Input type="number" value={form.tank_capacity_litres} onChange={(e) => setForm({ ...form, tank_capacity_litres: e.target.value })} placeholder="e.g. 60" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Avg fuel efficiency (km/L)</Label>
                  <Input type="number" step="0.1" value={form.avg_km_per_litre} onChange={(e) => setForm({ ...form, avg_km_per_litre: e.target.value })} placeholder="e.g. 10" />
                </div>
              </div>
            </section>

            {/* Assignment */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Assignment & budget</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned employee</Label>
                  <Select value={form.assigned_driver_id || '__none__'} onValueChange={(v) => setForm({ ...form, assigned_driver_id: v === '__none__' ? '' : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {allEmployees.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Weekly fuel budget (₦)</Label>
                  <Input type="number" value={form.weekly_budget_ngn} onChange={(e) => setForm({ ...form, weekly_budget_ngn: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Compliance & service */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Compliance & service</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Insurance expiry</Label>
                  <Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Road worthiness expiry</Label>
                  <Input type="date" value={form.road_worthiness_expiry} onChange={(e) => setForm({ ...form, road_worthiness_expiry: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last service date</Label>
                  <Input type="date" value={form.last_service_date} onChange={(e) => setForm({ ...form, last_service_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Next service date</Label>
                  <Input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Notes */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="kd-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes about this vehicle..." />
            </section>
          </div>

          {/* Sticky footer */}
          <DialogFooter className="px-6 py-4 border-t border-border/60 bg-card/50 backdrop-blur-sm flex-col gap-3 mt-0">
            {/* Non-admin one-time warning — shown only when adding (not editing) */}
            {!isAdmin && !editing && (
              <div className="w-full rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Please verify all details before submitting</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                      Once saved, you will <strong>not be able to edit</strong> this vehicle record. Any corrections will require an administrator.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={nonAdminConfirmed}
                    onChange={(e) => setNonAdminConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400 accent-amber-600"
                  />
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    I have verified all details and understand they cannot be changed after submission
                  </span>
                </label>
              </div>
            )}
            <div className="flex items-center justify-between w-full gap-3">
              <p className="text-xs text-muted-foreground hidden sm:block">
                {(!form.name.trim() || !form.plate_number.trim())
                  ? <><span className="text-destructive">●</span> Fill in name and plate number to save</>
                  : <><span className="text-success">●</span> Ready to save</>}
              </p>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  disabled={submitting || !form.name.trim() || !form.plate_number.trim() || (!isAdmin && !editing && !nonAdminConfirmed)}
                  className={(!submitting && form.name.trim() && form.plate_number.trim()) ? 'kd-magnetic' : ''}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? 'Update vehicle' : 'Add vehicle'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete vehicle</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong> ({confirmDelete?.plate_number})? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirmDelete) {
                  await handleDelete(confirmDelete);
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingFuelHistory && (
        <FuelHistoryDialog vehicle={viewingFuelHistory} onClose={() => setViewingFuelHistory(null)} />
      )}

      {viewingMaintenance && (
        <VehicleMaintenanceDialog vehicle={viewingMaintenance} onClose={() => { setViewingMaintenance(null); load(); }} />
      )}

      {/* Vehicle Inspection */}
      {inspectingVehicle && (
        <VehicleInspectionForm
          vehicleId={inspectingVehicle.id}
          vehicleName={`${inspectingVehicle.name} (${inspectingVehicle.plate_number})`}
          inspectionType="ad_hoc"
          open={!!inspectingVehicle}
          onOpenChange={(open) => { if (!open) setInspectingVehicle(null); }}
        />
      )}

      {/* Out-of-service dialog */}
      <Dialog open={!!settingOutOfService} onOpenChange={(open) => { if (!open) { setSettingOutOfService(null); setOutOfServiceDate(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4" />
              {settingOutOfService && isOutOfService(settingOutOfService) ? 'Return to service' : 'Mark out of service'}
            </DialogTitle>
            <DialogDescription>
              {settingOutOfService?.name} ({settingOutOfService?.plate_number})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Out of service until</Label>
              <Input
                type="date"
                value={outOfServiceDate}
                onChange={(e) => setOutOfServiceDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to return the vehicle to service immediately.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSettingOutOfService(null); setOutOfServiceDate(''); }}>Cancel</Button>
            <Button
              variant={outOfServiceDate ? 'destructive' : 'default'}
              onClick={handleMarkOutOfService}
            >
              {outOfServiceDate ? 'Mark out of service' : 'Return to service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'one_time',       label: 'One-time' },
  { value: 'every_3_months', label: 'Every 3 months' },
  { value: 'every_6_months', label: 'Every 6 months' },
  { value: 'every_10000_km', label: 'Every 10,000 km' },
  { value: 'custom',         label: 'Custom' },
];

function effectiveMaintStatus(item: MaintenanceRecord): 'done' | 'overdue' | 'upcoming' | 'pending' {
  if (item.status === 'done') return 'done';
  if (item.due_date) {
    const days = Math.ceil((new Date(item.due_date).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return 'overdue';
    if (days <= 7) return 'upcoming';
  }
  return 'pending';
}

function maintStatusBadge(status: ReturnType<typeof effectiveMaintStatus>) {
  switch (status) {
    case 'done':     return 'bg-success/10 text-success border-success/20';
    case 'overdue':  return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'upcoming': return 'bg-warning/10 text-warning border-warning/20';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function VehicleMaintenanceDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loadingRec, setLoadingRec] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({
    service_type: 'Oil Change',
    custom_service_type: '',
    due_date: '',
    due_mileage_km: '',
    recurrence: 'one_time',
    last_done_date: '',
    last_done_mileage_km: '',
    notes: '',
  });

  const loadRecords = useCallback(async () => {
    setLoadingRec(true);
    const { data } = await supabase
      .from('vehicle_maintenance')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .order('due_date', { ascending: true, nullsFirst: false });
    setRecords((data as MaintenanceRecord[]) || []);
    setLoadingRec(false);
  }, [vehicle.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const resetAdd = () => setAddForm({
    service_type: 'Oil Change', custom_service_type: '', due_date: '',
    due_mileage_km: '', recurrence: 'one_time', last_done_date: '',
    last_done_mileage_km: '', notes: '',
  });

  const handleAdd = async () => {
    const svcType = addForm.service_type === 'Custom' ? addForm.custom_service_type.trim() : addForm.service_type;
    if (!svcType) { toast({ title: 'Service type is required', variant: 'destructive' }); return; }

    // Calculate due_date / due_mileage_km from recurrence
    let dueDate: string | null = addForm.due_date || null;
    let dueMileage: number | null = parseInt(addForm.due_mileage_km) || null;
    const baseDateStr = addForm.last_done_date || new Date().toISOString().slice(0, 10);
    const baseMileage = parseInt(addForm.last_done_mileage_km) || 0;

    switch (addForm.recurrence) {
      case 'every_3_months': dueDate = addMonths(baseDateStr, 3); dueMileage = null; break;
      case 'every_6_months': dueDate = addMonths(baseDateStr, 6); dueMileage = null; break;
      case 'every_10000_km': dueDate = null; dueMileage = baseMileage + 10_000; break;
    }

    setSubmitting(true);
    const { error } = await supabase.from('vehicle_maintenance').insert({
      vehicle_id: vehicle.id,
      service_type: svcType,
      due_date: dueDate,
      due_mileage_km: dueMileage,
      recurrence: addForm.recurrence,
      last_done_date: addForm.last_done_date || null,
      last_done_mileage_km: parseInt(addForm.last_done_mileage_km) || null,
      status: 'pending',
      notes: addForm.notes.trim() || null,
      created_by: profile?.id,
    });
    setSubmitting(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Service item added' });
    setShowAdd(false);
    resetAdd();
    loadRecords();
  };

  const handleMarkDone = async (item: MaintenanceRecord) => {
    const today = new Date().toISOString().slice(0, 10);
    // Calculate next due from recurrence
    let nextDueDate: string | null = null;
    let nextDueMileage: number | null = null;
    const baseMileage = item.last_done_mileage_km || 0;
    switch (item.recurrence) {
      case 'every_3_months': nextDueDate = addMonths(today, 3); break;
      case 'every_6_months': nextDueDate = addMonths(today, 6); break;
      case 'every_10000_km': nextDueMileage = baseMileage + 10_000; break;
    }
    const isRecurring = item.recurrence !== 'one_time' && item.recurrence !== 'custom';
    const { error } = await supabase.from('vehicle_maintenance').update({
      status: isRecurring ? 'pending' : 'done',
      last_done_date: today,
      due_date: isRecurring ? nextDueDate : item.due_date,
      due_mileage_km: isRecurring ? nextDueMileage : item.due_mileage_km,
    }).eq('id', item.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Marked as done' + (isRecurring ? ' — next due date set' : '') });
    loadRecords();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('vehicle_maintenance').delete().eq('id', id);
    loadRecords();
  };

  const pending = records.filter((r) => effectiveMaintStatus(r) !== 'done');
  const done    = records.filter((r) => effectiveMaintStatus(r) === 'done');

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Maintenance — {vehicle.name} ({vehicle.plate_number})
          </DialogTitle>
          <DialogDescription>Service schedule and history for this vehicle.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{pending.length} active item{pending.length !== 1 ? 's' : ''}</p>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Service Item
            </Button>
          </div>

          {loadingRec ? (
            <TableSkeleton rows={3} />
          ) : pending.length === 0 && done.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No service items yet. Click "Add Service Item" to create the first one.</p>
          ) : (
            <>
              {pending.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service Type</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Due Mileage (km)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Done</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pending.map((item) => {
                          const st = effectiveMaintStatus(item);
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium text-sm">{item.service_type}</TableCell>
                              <TableCell className="text-sm">{item.due_date ? formatDate(item.due_date) : '—'}</TableCell>
                              <TableCell className="text-sm">{item.due_mileage_km != null ? item.due_mileage_km.toLocaleString() : '—'}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={`text-xs border ${maintStatusBadge(st)}`}>
                                  {st.charAt(0).toUpperCase() + st.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {item.last_done_date ? formatDate(item.last_done_date) : '—'}
                                {item.last_done_mileage_km != null && ` / ${item.last_done_mileage_km.toLocaleString()} km`}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{item.notes || '—'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" title="Mark done" onClick={() => handleMarkDone(item)}>
                                    <CheckSquare className="h-4 w-4 text-success" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
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
                  </CardContent>
                </Card>
              )}

              {done.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completed</p>
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service Type</TableHead>
                            <TableHead>Last Done Date</TableHead>
                            <TableHead>Last Done Mileage</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {done.map((item) => (
                            <TableRow key={item.id} className="opacity-60">
                              <TableCell className="text-sm">{item.service_type}</TableCell>
                              <TableCell className="text-sm">{item.last_done_date ? formatDate(item.last_done_date) : '—'}</TableCell>
                              <TableCell className="text-sm">{item.last_done_mileage_km != null ? item.last_done_mileage_km.toLocaleString() + ' km' : '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{item.notes || '—'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1 items-center">
                                  {item.receipt_url && (
                                    <FilePreviewTrigger
                                      url={item.receipt_url}
                                      label="Receipt"
                                      fileName={`${item.service_type}-receipt`}
                                    />
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 pb-4 pt-3 border-t bg-background">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Add service item sub-dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); resetAdd(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service Item</DialogTitle>
            <DialogDescription>{vehicle.name} ({vehicle.plate_number})</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>Service Type <span className="text-destructive">*</span></Label>
              <Select value={addForm.service_type} onValueChange={(v) => setAddForm({ ...addForm, service_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {addForm.service_type === 'Custom' && (
                <Input
                  placeholder="Describe the service…"
                  value={addForm.custom_service_type}
                  onChange={(e) => setAddForm({ ...addForm, custom_service_type: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-1">
              <Label>Recurrence</Label>
              <Select value={addForm.recurrence} onValueChange={(v) => setAddForm({ ...addForm, recurrence: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(addForm.recurrence === 'one_time' || addForm.recurrence === 'custom') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={addForm.due_date} onChange={(e) => setAddForm({ ...addForm, due_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Due Mileage (km)</Label>
                  <Input type="number" placeholder="e.g. 45000" value={addForm.due_mileage_km} onChange={(e) => setAddForm({ ...addForm, due_mileage_km: e.target.value })} />
                </div>
              </div>
            )}

            {(addForm.recurrence === 'every_3_months' || addForm.recurrence === 'every_6_months') && (
              <div className="space-y-1">
                <Label>Last Done Date <span className="text-muted-foreground text-xs font-normal">(used to calculate next due)</span></Label>
                <Input type="date" value={addForm.last_done_date} onChange={(e) => setAddForm({ ...addForm, last_done_date: e.target.value })} />
                <p className="text-xs text-muted-foreground">
                  Next due: {addForm.last_done_date
                    ? formatDate(addMonths(addForm.last_done_date, addForm.recurrence === 'every_3_months' ? 3 : 6))
                    : formatDate(addMonths(new Date().toISOString().slice(0, 10), addForm.recurrence === 'every_3_months' ? 3 : 6))}
                </p>
              </div>
            )}

            {addForm.recurrence === 'every_10000_km' && (
              <div className="space-y-1">
                <Label>Last Done Mileage (km) <span className="text-muted-foreground text-xs font-normal">(used to calculate next due)</span></Label>
                <Input type="number" placeholder="e.g. 35000" value={addForm.last_done_mileage_km} onChange={(e) => setAddForm({ ...addForm, last_done_mileage_km: e.target.value })} />
                {addForm.last_done_mileage_km && (
                  <p className="text-xs text-muted-foreground">Next due at: {(parseInt(addForm.last_done_mileage_km) + 10_000).toLocaleString()} km</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Optional notes…" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetAdd(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export { FuelGauge };
export default VehiclesTab;
