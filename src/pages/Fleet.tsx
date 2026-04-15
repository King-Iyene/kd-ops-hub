import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, X, Plus, Fuel, MapPin } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  make_model: string;
  weekly_budget_ngn: number;
}

const Fleet = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState(isAdmin ? 'requests' : 'fuel-request');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelRequests, setFuelRequests] = useState<any[]>([]);
  const [tripLogs, setTripLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fuel request form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({ vehicle_id: '', station_name: '', amount_ngn: '', litres_est: '', odometer: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  // Trip log form
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripForm, setTripForm] = useState({ vehicle_id: '', date: '', start_location: '', end_location: '', odometer_start: '', odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [vehiclesRes, fuelRes, tripRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('status', 'active'),
      supabase.from('fuel_requests').select('*, vehicles(name, plate_number)').order('created_at', { ascending: false }).limit(50),
      supabase.from('trip_logs').select('*, vehicles(name, plate_number)').order('created_at', { ascending: false }).limit(50),
    ]);
    setVehicles((vehiclesRes.data as Vehicle[]) || []);
    setFuelRequests(fuelRes.data || []);
    setTripLogs(tripRes.data || []);
    setLoading(false);
  };

  const submitFuelRequest = async () => {
    setSubmitting(true);
    const { error } = await supabase.from('fuel_requests').insert({
      vehicle_id: fuelForm.vehicle_id,
      driver_id: profile?.id,
      station_name: fuelForm.station_name,
      amount_ngn: parseFloat(fuelForm.amount_ngn),
      litres_est: parseFloat(fuelForm.litres_est),
      odometer: parseFloat(fuelForm.odometer),
      reason: fuelForm.reason,
      status: 'pending',
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Fuel request submitted' }); setShowFuelForm(false); fetchData(); }
    setSubmitting(false);
  };

  const submitTripLog = async () => {
    setSubmitting(true);
    const start = parseFloat(tripForm.odometer_start);
    const end = parseFloat(tripForm.odometer_end);
    const { error } = await supabase.from('trip_logs').insert({
      vehicle_id: tripForm.vehicle_id,
      driver_id: profile?.id,
      date: tripForm.date,
      start_location: tripForm.start_location,
      end_location: tripForm.end_location,
      odometer_start: start,
      odometer_end: end,
      km_driven: end - start,
      fuel_amount_ngn: parseFloat(tripForm.fuel_amount_ngn) || 0,
      litres: parseFloat(tripForm.litres) || 0,
      issues: tripForm.issues,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Trip log submitted' }); setShowTripForm(false); fetchData(); }
    setSubmitting(false);
  };

  const handleFuelAction = async (id: string, status: string, note?: string) => {
    await supabase.from('fuel_requests').update({ status, admin_note: note }).eq('id', id);
    toast({ title: `Fuel request ${status}` });
    fetchData();
  };

  // Chart data
  const fuelChartData = vehicles.map((v) => {
    const spent = fuelRequests.filter((f) => f.vehicle_id === v.id && f.status === 'approved').reduce((s, f) => s + (f.amount_ngn || 0), 0);
    return { name: v.name, spent, budget: v.weekly_budget_ngn };
  });

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fleet Management</h1>
          <p className="text-muted-foreground text-sm">{isAdmin ? 'Manage vehicles, fuel, and trips' : 'Submit fuel requests and trip logs'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTripForm(true)}>
            <MapPin className="mr-2 h-4 w-4" /> Log Trip
          </Button>
          <Button onClick={() => setShowFuelForm(true)}>
            <Fuel className="mr-2 h-4 w-4" /> Request Fuel
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {isAdmin && <TabsTrigger value="requests">Fuel Requests</TabsTrigger>}
          <TabsTrigger value="trips">Trip Logs</TabsTrigger>
          {isAdmin && <TabsTrigger value="overview">Overview</TabsTrigger>}
          {!isAdmin && <TabsTrigger value="fuel-request">My Requests</TabsTrigger>}
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Odometer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.vehicles?.name || 'N/A'}</TableCell>
                      <TableCell>{r.station_name}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(r.amount_ngn)}</TableCell>
                      <TableCell>{r.odometer?.toLocaleString()} km</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={r.status === 'approved' ? 'bg-success/10 text-success' : r.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      {isAdmin && r.status === 'pending' && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => handleFuelAction(r.id, 'approved')}><Check className="h-4 w-4 text-success" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleFuelAction(r.id, 'rejected')}><X className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fuel-request" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelRequests.filter((r) => r.driver_id === profile?.id).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.vehicles?.name || 'N/A'}</TableCell>
                      <TableCell>{r.station_name}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(r.amount_ngn)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={r.status === 'approved' ? 'bg-success/10 text-success' : r.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trips" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Fuel (₦)</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tripLogs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.vehicles?.name || 'N/A'}</TableCell>
                      <TableCell>{formatDate(t.date)}</TableCell>
                      <TableCell className="text-sm">{t.start_location} → {t.end_location}</TableCell>
                      <TableCell className="text-right">{t.km_driven}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(t.fuel_amount_ngn || 0)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.issues || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Weekly Fuel: Budget vs Spend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={fuelChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: number) => formatNaira(v)} />
                    <Bar dataKey="budget" fill="hsl(152, 43%, 50%)" opacity={0.3} name="Budget" />
                    <Bar dataKey="spent" fill="hsl(153, 41%, 18%)" name="Spent" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Fuel Request Dialog */}
      <Dialog open={showFuelForm} onOpenChange={setShowFuelForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Fuel Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Vehicle</Label>
              <Select value={fuelForm.vehicle_id} onValueChange={(v) => setFuelForm({ ...fuelForm, vehicle_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Fuel Station</Label><Input value={fuelForm.station_name} onChange={(e) => setFuelForm({ ...fuelForm, station_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Amount (₦)</Label><Input type="number" value={fuelForm.amount_ngn} onChange={(e) => setFuelForm({ ...fuelForm, amount_ngn: e.target.value })} /></div>
              <div className="space-y-1"><Label>Litres (est.)</Label><Input type="number" value={fuelForm.litres_est} onChange={(e) => setFuelForm({ ...fuelForm, litres_est: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Odometer (km)</Label><Input type="number" value={fuelForm.odometer} onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })} /></div>
            <div className="space-y-1"><Label>Reason</Label><Textarea value={fuelForm.reason} onChange={(e) => setFuelForm({ ...fuelForm, reason: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFuelForm(false)}>Cancel</Button>
            <Button onClick={submitFuelRequest} disabled={submitting || !fuelForm.vehicle_id}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip Log Dialog */}
      <Dialog open={showTripForm} onOpenChange={setShowTripForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Daily Trip Log</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Vehicle</Label>
              <Select value={tripForm.vehicle_id} onValueChange={(v) => setTripForm({ ...tripForm, vehicle_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={tripForm.date} onChange={(e) => setTripForm({ ...tripForm, date: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start Location</Label><Input value={tripForm.start_location} onChange={(e) => setTripForm({ ...tripForm, start_location: e.target.value })} /></div>
              <div className="space-y-1"><Label>End Location</Label><Input value={tripForm.end_location} onChange={(e) => setTripForm({ ...tripForm, end_location: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Odometer Start</Label><Input type="number" value={tripForm.odometer_start} onChange={(e) => setTripForm({ ...tripForm, odometer_start: e.target.value })} /></div>
              <div className="space-y-1"><Label>Odometer End</Label><Input type="number" value={tripForm.odometer_end} onChange={(e) => setTripForm({ ...tripForm, odometer_end: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Fuel Amount (₦)</Label><Input type="number" value={tripForm.fuel_amount_ngn} onChange={(e) => setTripForm({ ...tripForm, fuel_amount_ngn: e.target.value })} /></div>
              <div className="space-y-1"><Label>Litres</Label><Input type="number" value={tripForm.litres} onChange={(e) => setTripForm({ ...tripForm, litres: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Vehicle Issues</Label><Textarea value={tripForm.issues} onChange={(e) => setTripForm({ ...tripForm, issues: e.target.value })} placeholder="Any issues to report..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTripForm(false)}>Cancel</Button>
            <Button onClick={submitTripLog} disabled={submitting || !tripForm.vehicle_id || !tripForm.date}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Fleet;
