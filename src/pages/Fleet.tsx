import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { notifyUser, notifyRoles } from '@/lib/notify';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Loader2, Check, X, Fuel, MapPin, Plus, Car, Pencil, Trash2, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface FieldStaff {
  id: string;
  full_name: string;
  email: string;
}

interface FuelRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  station_name: string;
  amount_ngn: number;
  litres_est: number | null;
  odometer: number | null;
  reason: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface TripLog {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  start_location: string;
  end_location: string;
  odometer_start: number | null;
  odometer_end: number | null;
  km_driven: number | null;
  fuel_amount_ngn: number | null;
  litres: number | null;
  issues: string | null;
  created_at: string;
}

const Fleet = () => {
  usePageTitle('Fleet');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin';

  const [tab, setTab] = useState<'fuel' | 'trips' | 'vehicles'>('fuel');

  const [staff, setStaff] = useState<FieldStaff[]>([]);
  const [fuelRequests, setFuelRequests] = useState<FuelRequest[]>([]);
  const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fuel request form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({
    employee_id: profile?.id || '',
    station_name: '',
    amount_ngn: '',
    litres_est: '',
    odometer: '',
    reason: '',
  });

  // Trip log form
  const [showTripForm, setShowTripForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [tripForm, setTripForm] = useState({
    employee_id: profile?.id || '',
    date: today,
    start_location: '',
    end_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_amount_ngn: '',
    litres: '',
    issues: '',
  });

  useEffect(() => {
    // keep form employee_id in sync with the logged-in user
    setFuelForm((f) => ({ ...f, employee_id: profile?.id || '' }));
    setTripForm((f) => ({ ...f, employee_id: profile?.id || '' }));
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enrich = (rows: any[], staffList: FieldStaff[]) => {
    const byId = new Map(staffList.map((s) => [s.id, s]));
    return rows.map((r) => ({
      ...r,
      employee_id: r.driver_id,
      employee_name: byId.get(r.driver_id)?.full_name || r.driver_id,
    }));
  };

  const fetchData = async () => {
    setLoading(true);
    const [staffRes, profilesRes, fuelRes, tripRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'field_staff')
        .eq('status', 'active')
        .order('full_name'),
      // fetch all profiles for name lookup (audit / display)
      supabase.from('profiles').select('id, full_name, email'),
      supabase
        .from('fuel_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('trip_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const fieldStaff = (staffRes.data as FieldStaff[]) || [];
    setStaff(fieldStaff);

    const lookup = ((profilesRes.data as FieldStaff[]) || []).concat(fieldStaff);
    setFuelRequests(enrich(fuelRes.data || [], lookup));
    setTripLogs(enrich(tripRes.data || [], lookup));
    setLoading(false);
  };

  const submitFuelRequest = async () => {
    if (!fuelForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('fuel_requests').insert({
      driver_id: fuelForm.employee_id,
      station_name: fuelForm.station_name,
      amount_ngn: parseFloat(fuelForm.amount_ngn) || 0,
      litres_est: parseFloat(fuelForm.litres_est) || null,
      odometer: parseFloat(fuelForm.odometer) || null,
      reason: fuelForm.reason,
      status: 'pending',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit(
        'fuel_request_submitted',
        `Fuel request submitted (${formatNaira(
          parseFloat(fuelForm.amount_ngn) || 0,
        )} at ${fuelForm.station_name})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'fuel_request_submitted',
        module: 'fleet',
        title: 'Fuel request submitted',
        body: `${formatNaira(parseFloat(fuelForm.amount_ngn) || 0)} at ${fuelForm.station_name}`,
      });
      toast({ title: 'Fuel request submitted' });
      setShowFuelForm(false);
      setFuelForm({
        employee_id: profile?.id || '',
        station_name: '',
        amount_ngn: '',
        litres_est: '',
        odometer: '',
        reason: '',
      });
      fetchData();
    }
    setSubmitting(false);
  };

  const submitTripLog = async () => {
    if (!tripForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    const start = parseFloat(tripForm.odometer_start);
    const end = parseFloat(tripForm.odometer_end);
    const km = Number.isFinite(end - start) ? end - start : null;
    setSubmitting(true);
    const { error } = await supabase.from('trip_logs').insert({
      driver_id: tripForm.employee_id,
      date: tripForm.date,
      start_location: tripForm.start_location,
      end_location: tripForm.end_location,
      odometer_start: Number.isFinite(start) ? start : null,
      odometer_end: Number.isFinite(end) ? end : null,
      km_driven: km,
      fuel_amount_ngn: parseFloat(tripForm.fuel_amount_ngn) || null,
      litres: parseFloat(tripForm.litres) || null,
      issues: tripForm.issues || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit(
        'trip_log_submitted',
        `Trip log ${tripForm.start_location} → ${tripForm.end_location} (${km ?? '—'} km)`,
        profile,
      );
      toast({ title: 'Trip log submitted' });
      setShowTripForm(false);
      setTripForm({
        employee_id: profile?.id || '',
        date: today,
        start_location: '',
        end_location: '',
        odometer_start: '',
        odometer_end: '',
        fuel_amount_ngn: '',
        litres: '',
        issues: '',
      });
      fetchData();
    }
    setSubmitting(false);
  };

  const [rejectingFuel, setRejectingFuel] = useState<FuelRequest | null>(null);
  const [fuelRejectReason, setFuelRejectReason] = useState('');

  const handleFuelAction = async (
    request: FuelRequest,
    status: 'approved' | 'rejected',
  ) => {
    if (!isAdmin) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve or reject fuel requests.',
        variant: 'destructive',
      });
      return;
    }
    if (status === 'rejected') {
      setRejectingFuel(request);
      setFuelRejectReason('');
      return;
    }
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'approved' })
      .eq('id', request.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'fuel_request_approved',
      `Fuel request for ${request.employee_name} approved (${formatNaira(request.amount_ngn || 0)})`,
      profile,
    );
    if ((request as any).driver_id || request.employee_id) {
      await notifyUser({
        userId: (request as any).driver_id || request.employee_id,
        type: 'fuel_request_approved',
        module: 'fleet',
        title: 'Your fuel request was approved',
        body: `${formatNaira(request.amount_ngn || 0)} at ${request.station_name}`,
      });
    }
    toast({ title: 'Fuel request approved' });
    fetchData();
  };

  const confirmFuelReject = async () => {
    if (!rejectingFuel) return;
    if (!isValidRejectionReason(fuelRejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const r = rejectingFuel;
    const { error } = await supabase
      .from('fuel_requests')
      .update({
        status: 'rejected',
        rejection_reason: fuelRejectReason.trim(),
        admin_note: fuelRejectReason.trim(),
      })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await writeRejectionNotification({
      entity: 'fuel',
      entityLabel: 'fuel request',
      amount: r.amount_ngn,
      reason: fuelRejectReason.trim(),
      submitterId: (r as any).driver_id || r.employee_id || null,
      actor: profile,
      auditType: 'fuel_request_rejected',
      auditDescription: `Fuel request for ${r.employee_name} rejected (${formatNaira(r.amount_ngn || 0)}): ${fuelRejectReason.trim()}`,
    });
    toast({ title: 'Fuel request rejected' });
    setRejectingFuel(null);
    setFuelRejectReason('');
    fetchData();
  };

  const resubmitFuel = async (r: FuelRequest) => {
    const { error } = await supabase.from('fuel_requests').insert({
      driver_id: profile?.id,
      station_name: r.station_name,
      amount_ngn: r.amount_ngn,
      litres_est: r.litres_est,
      odometer: r.odometer,
      reason: r.reason,
      status: 'pending',
      resubmitted_from_id: r.id,
    } as any);
    if (error) {
      toast({ title: 'Resubmit failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'resubmission_created',
      `Fuel request re-edited and resubmitted (${formatNaira(r.amount_ngn || 0)})`,
      profile,
    );
    toast({ title: 'Resubmitted for approval' });
    fetchData();
  };

  if (loading) return <TableSkeleton rows={5} />;

  const myFuelRequests = fuelRequests.filter((r) => r.employee_id === profile?.id);
  const myTripLogs = tripLogs.filter((r) => r.employee_id === profile?.id);

  const visibleFuel = isAdmin ? fuelRequests : myFuelRequests;
  const visibleTrips = isAdmin ? tripLogs : myTripLogs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Fleet</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Manage fuel requests and daily trip logs for company vehicles. Admins review and approve requests, and can add or manage vehicle records.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? 'Review fuel requests and trip logs'
              : 'Submit fuel requests and daily trip logs'}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'fuel' | 'trips' | 'vehicles')}>
        <TabsList>
          <TabsTrigger value="fuel">
            <Fuel className="mr-2 h-4 w-4" /> Fuel Requests
          </TabsTrigger>
          <TabsTrigger value="trips">
            <MapPin className="mr-2 h-4 w-4" /> Trip Logs
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="vehicles">
              <Car className="mr-2 h-4 w-4" /> Vehicles
            </TabsTrigger>
          )}
        </TabsList>

        {/* FUEL */}
        <TabsContent value="fuel" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowFuelForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Fuel Request
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAdmin ? 'All Fuel Requests' : 'My Fuel Requests'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead className="text-right">Odometer</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleFuel.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdmin ? 9 : 8}
                        className="text-center text-muted-foreground text-sm py-8"
                      >
                        No fuel requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleFuel.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell>{r.station_name}</TableCell>
                      <TableCell className="text-right currency">
                        {formatNaira(r.amount_ngn || 0)}
                      </TableCell>
                      <TableCell className="text-right">{r.litres_est ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {r.odometer?.toLocaleString() ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {r.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(r.created_at)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {r.status === 'pending' ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleFuelAction(r, 'approved')}
                              >
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleFuelAction(r, 'rejected')}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : r.status === 'rejected' && r.employee_id === profile?.id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resubmitFuel(r)}
                            >
                              Re-edit & Resubmit
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRIPS */}
        <TabsContent value="trips" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowTripForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Trip Log
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAdmin ? 'All Trip Logs' : 'My Trip Logs'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Fuel (₦)</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTrips.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground text-sm py-8"
                      >
                        No trip logs yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleTrips.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.employee_name}</TableCell>
                      <TableCell>{formatDate(t.date)}</TableCell>
                      <TableCell className="text-sm">
                        {t.start_location} → {t.end_location}
                      </TableCell>
                      <TableCell className="text-right">{t.km_driven ?? '—'}</TableCell>
                      <TableCell className="text-right currency">
                        {formatNaira(t.fuel_amount_ngn || 0)}
                      </TableCell>
                      <TableCell className="text-right">{t.litres ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {t.issues || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VEHICLES */}
        {isAdmin && (
          <TabsContent value="vehicles" className="mt-4">
            <VehiclesTab staff={staff} />
          </TabsContent>
        )}
      </Tabs>

      {/* FUEL REQUEST DIALOG */}
      <Dialog open={showFuelForm} onOpenChange={setShowFuelForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Fuel Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={fuelForm.employee_id}
                onValueChange={(v) => setFuelForm({ ...fuelForm, employee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>
                      {profile.full_name || profile.email} (me)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fuel Station</Label>
              <Input
                value={fuelForm.station_name}
                onChange={(e) => setFuelForm({ ...fuelForm, station_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount Requested (₦)</Label>
                <Input
                  type="number"
                  value={fuelForm.amount_ngn}
                  onChange={(e) => setFuelForm({ ...fuelForm, amount_ngn: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Litres (estimated)</Label>
                <Input
                  type="number"
                  value={fuelForm.litres_est}
                  onChange={(e) => setFuelForm({ ...fuelForm, litres_est: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Current Odometer Reading</Label>
              <Input
                type="number"
                value={fuelForm.odometer}
                onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Purpose / Reason</Label>
              <Textarea
                value={fuelForm.reason}
                onChange={(e) => setFuelForm({ ...fuelForm, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFuelForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitFuelRequest}
              disabled={
                submitting ||
                !fuelForm.employee_id ||
                !fuelForm.station_name ||
                !fuelForm.amount_ngn
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRIP LOG DIALOG */}
      <Dialog open={showTripForm} onOpenChange={setShowTripForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily Trip Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={tripForm.employee_id}
                onValueChange={(v) => setTripForm({ ...tripForm, employee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>
                      {profile.full_name || profile.email} (me)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={tripForm.date}
                onChange={(e) => setTripForm({ ...tripForm, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Location</Label>
                <Input
                  value={tripForm.start_location}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, start_location: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>End Location</Label>
                <Input
                  value={tripForm.end_location}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, end_location: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Odometer Start</Label>
                <Input
                  type="number"
                  value={tripForm.odometer_start}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, odometer_start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Odometer End</Label>
                <Input
                  type="number"
                  value={tripForm.odometer_end}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, odometer_end: e.target.value })
                  }
                />
                {tripForm.odometer_start && tripForm.odometer_end && (
                  <p className="text-xs text-muted-foreground">
                    {Math.max(
                      0,
                      parseFloat(tripForm.odometer_end) -
                        parseFloat(tripForm.odometer_start),
                    ).toLocaleString()}{' '}
                    km
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fuel Purchased (₦)</Label>
                <Input
                  type="number"
                  value={tripForm.fuel_amount_ngn}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, fuel_amount_ngn: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Litres</Label>
                <Input
                  type="number"
                  value={tripForm.litres}
                  onChange={(e) => setTripForm({ ...tripForm, litres: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Issues to Report</Label>
              <Textarea
                value={tripForm.issues}
                onChange={(e) => setTripForm({ ...tripForm, issues: e.target.value })}
                placeholder="Optional — vehicle or route issues..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTripForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitTripLog}
              disabled={
                submitting ||
                !tripForm.employee_id ||
                !tripForm.date ||
                !tripForm.start_location ||
                !tripForm.end_location
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectingFuel}
        onOpenChange={(v) => {
          if (!v) {
            setRejectingFuel(null);
            setFuelRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject fuel request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Reason is required. The driver is notified with this note.
          </p>
          <Textarea
            value={fuelRejectReason}
            onChange={(e) => setFuelRejectReason(e.target.value)}
            placeholder="e.g. Exceeds weekly fuel budget — split across two weeks."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingFuel(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmFuelReject}
              disabled={!isValidRejectionReason(fuelRejectReason)}
            >
              Reject with reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Fleet;

// ---------------------------------------------------------------------------
// Vehicles management tab
// ---------------------------------------------------------------------------

interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  make_model: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  assigned_driver_id: string | null;
  weekly_budget_ngn: number;
  insurance_expiry: string | null;
  road_worthiness_expiry: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
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
  insurance_expiry: '',
  road_worthiness_expiry: '',
  last_service_date: '',
  next_service_date: '',
  notes: '',
};

function VehiclesTab({ staff }: { staff: FieldStaff[] }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyVehicleForm);
  const [submitting, setSubmitting] = useState(false);
  const [allDrivers, setAllDrivers] = useState<FieldStaff[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [vRes, dRes] = await Promise.all([
      supabase.from('vehicles').select('*').order('name'),
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('role', ['field_staff', 'driver', 'operations'])
        .eq('status', 'active')
        .order('full_name'),
    ]);
    setVehicles((vRes.data as Vehicle[]) || []);
    setAllDrivers((dRes.data as FieldStaff[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setForm(emptyVehicleForm);
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

  const driverName = (id: string | null) => {
    if (!id) return '—';
    const d = allDrivers.find((s) => s.id === id) || staff.find((s) => s.id === id);
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Assigned Driver</TableHead>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">
                      No vehicles registered yet. Add your first vehicle to start tracking.
                    </TableCell>
                  </TableRow>
                )}
                {vehicles.map((v) => (
                  <TableRow key={v.id} className="kd-transition">
                    <TableCell>
                      <div className="font-medium">{v.name}</div>
                      {v.make_model && (
                        <div className="text-xs text-muted-foreground">
                          {v.make_model}{v.year ? ` (${v.year})` : ''}{v.color ? ` · ${v.color}` : ''}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{v.plate_number}</TableCell>
                    <TableCell className="text-sm">{driverName(v.assigned_driver_id)}</TableCell>
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
                            ? 'bg-success/10 text-success cursor-pointer'
                            : 'bg-muted text-muted-foreground cursor-pointer'
                        }
                        onClick={() => toggleStatus(v)}
                      >
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(v)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); reset(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office Hilux" />
              </div>
              <div className="space-y-1">
                <Label>Plate number *</Label>
                <Input value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} placeholder="e.g. LAG-123-AB" />
              </div>
              <div className="space-y-1">
                <Label>Make / model</Label>
                <Input value={form.make_model} onChange={(e) => setForm({ ...form, make_model: e.target.value })} placeholder="e.g. Toyota Hilux" />
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2022" />
              </div>
              <div className="space-y-1">
                <Label>Color</Label>
                <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. White" />
              </div>
              <div className="space-y-1">
                <Label>VIN</Label>
                <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Assigned driver</Label>
                <Select value={form.assigned_driver_id} onValueChange={(v) => setForm({ ...form, assigned_driver_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {allDrivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Weekly fuel budget (₦)</Label>
                <Input type="number" value={form.weekly_budget_ngn} onChange={(e) => setForm({ ...form, weekly_budget_ngn: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Insurance expiry</Label>
                <Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Road worthiness expiry</Label>
                <Input type="date" value={form.road_worthiness_expiry} onChange={(e) => setForm({ ...form, road_worthiness_expiry: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Last service date</Label>
                <Input type="date" value={form.last_service_date} onChange={(e) => setForm({ ...form, last_service_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Next service date</Label>
                <Input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes about this vehicle..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting || !form.name.trim() || !form.plate_number.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Add'}
            </Button>
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
    </>
  );
}
