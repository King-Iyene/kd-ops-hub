import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, X, Fuel, MapPin, Plus } from 'lucide-react';

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
  const { profile } = useAuthStore();
  const { toast } = useToast();
  // Role-based access control removed — every authenticated user sees and acts on all fleet data.
  const isAdmin = true;

  const [tab, setTab] = useState<'fuel' | 'trips'>('fuel');

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

  const handleFuelAction = async (
    request: FuelRequest,
    status: 'approved' | 'rejected',
    note?: string,
  ) => {
    if (!isAdmin) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve or reject fuel requests.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status, admin_note: note ?? null })
      .eq('id', request.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      status === 'approved' ? 'fuel_request_approved' : 'fuel_request_rejected',
      `Fuel request for ${request.employee_name} ${status} (${formatNaira(
        request.amount_ngn || 0,
      )})`,
      profile,
    );
    toast({ title: `Fuel request ${status}` });
    fetchData();
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const myFuelRequests = fuelRequests.filter((r) => r.employee_id === profile?.id);
  const myTripLogs = tripLogs.filter((r) => r.employee_id === profile?.id);

  const visibleFuel = isAdmin ? fuelRequests : myFuelRequests;
  const visibleTrips = isAdmin ? tripLogs : myTripLogs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Fleet</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? 'Review fuel requests and trip logs'
              : 'Submit fuel requests and daily trip logs'}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'fuel' | 'trips')}>
        <TabsList>
          <TabsTrigger value="fuel">
            <Fuel className="mr-2 h-4 w-4" /> Fuel Requests
          </TabsTrigger>
          <TabsTrigger value="trips">
            <MapPin className="mr-2 h-4 w-4" /> Trip Logs
          </TabsTrigger>
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
                        <Badge
                          variant="secondary"
                          className={
                            r.status === 'approved'
                              ? 'bg-success/10 text-success'
                              : r.status === 'rejected'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-warning/10 text-warning'
                          }
                        >
                          {r.status}
                        </Badge>
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
    </div>
  );
};

export default Fleet;
