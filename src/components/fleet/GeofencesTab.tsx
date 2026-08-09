import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, MAP_OPTIONS, MAPS_LIBRARIES } from '@/lib/maps';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Trash2, MapPin, Map as MapIcon } from 'lucide-react';
import { type Geofence } from '@/lib/fleet-utils';

const GEOFENCE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function GeofencesTab() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', center_lat: '', center_lng: '', radius_meters: '500', color: '#3b82f6', description: '' });
  const [pickingOnMap, setPickingOnMap] = useState(false);
  const { isLoaded: mapsLoaded } = useJsApiLoader({ id: 'kd-gmaps', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: MAPS_LIBRARIES });
  const [gmap, setGmap] = useState<google.maps.Map | null>(null);
  const circlesRef = useRef<Map<string, google.maps.Circle>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('geofences').select('*').order('created_at', { ascending: false });
    setGeofences((data as Geofence[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!pickingOnMap || !e.latLng) return;
    setForm((f) => ({ ...f, center_lat: e.latLng!.lat().toFixed(6), center_lng: e.latLng!.lng().toFixed(6) }));
    setPickingOnMap(false);
  }, [pickingOnMap]);

  // Update circle overlays when geofences change
  useEffect(() => {
    if (!gmap) return;
    // Remove stale circles
    for (const [id, c] of circlesRef.current) {
      if (!geofences.find((g) => g.id === id)) { c.setMap(null); circlesRef.current.delete(id); }
    }
    // Add / update circles
    for (const g of geofences) {
      if (circlesRef.current.has(g.id)) {
        const c = circlesRef.current.get(g.id)!;
        c.setCenter({ lat: g.center_lat, lng: g.center_lng });
        c.setRadius(g.radius_meters);
      } else {
        const c = new google.maps.Circle({
          map: gmap,
          center: { lat: g.center_lat, lng: g.center_lng },
          radius: g.radius_meters,
          strokeColor: g.color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: g.color,
          fillOpacity: 0.15,
        });
        circlesRef.current.set(g.id, c);
      }
    }
  }, [gmap, geofences]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.center_lat || !form.center_lng) {
      toast({ title: 'Required', description: 'Name and map location are required.', variant: 'destructive' }); return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('geofences').insert({
      name: form.name.trim(),
      center_lat: parseFloat(form.center_lat),
      center_lng: parseFloat(form.center_lng),
      radius_meters: Math.max(50, parseInt(form.radius_meters) || 500),
      color: form.color,
      description: form.description.trim() || null,
      created_by: profile?.id,
    });
    setSubmitting(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Geofence created' });
    setShowForm(false);
    setForm({ name: '', center_lat: '', center_lng: '', radius_meters: '500', color: '#3b82f6', description: '' });
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('geofences').delete().eq('id', id);
    circlesRef.current.get(id)?.setMap(null);
    circlesRef.current.delete(id);
    setGeofences((prev) => prev.filter((g) => g.id !== id));
    toast({ title: 'Geofence removed' });
  };

  const LAGOS_CTR: google.maps.LatLngLiteral = { lat: 6.5244, lng: 3.3792 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{geofences.length} zone{geofences.length !== 1 ? 's' : ''} defined</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" /> Add Zone
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Zone name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Head Office" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Radius (meters)</Label>
                <Input type="number" min={50} value={form.radius_meters} onChange={(e) => setForm((f) => ({ ...f, radius_meters: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Latitude</Label>
                <Input value={form.center_lat} onChange={(e) => setForm((f) => ({ ...f, center_lat: e.target.value }))} placeholder="Click map to fill" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Longitude</Label>
                <Input value={form.center_lng} onChange={(e) => setForm((f) => ({ ...f, center_lng: e.target.value }))} placeholder="Click map to fill" className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Description</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {GEOFENCE_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={cn('w-6 h-6 rounded-full border-2 transition-all', form.color === c ? 'border-foreground scale-110' : 'border-transparent')}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" type="button" onClick={() => setPickingOnMap(true)} className={cn(pickingOnMap && 'border-primary text-primary')}>
                <MapPin className="mr-1.5 h-3.5 w-3.5" /> {pickingOnMap ? 'Click map to place…' : 'Pick on map'}
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Zone'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!GOOGLE_MAPS_API_KEY ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-sm text-muted-foreground">
          <MapIcon className="h-8 w-8 opacity-30" />
          <p>Add <code className="bg-muted px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to enable maps</p>
        </CardContent></Card>
      ) : !mapsLoaded ? (
        <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>
      ) : (
        <div className="rounded-xl overflow-hidden border border-border/60 shadow-sm" style={{ height: 460 }}>
          <GoogleMap
            center={LAGOS_CTR}
            zoom={11}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            options={{ ...MAP_OPTIONS, fullscreenControl: true }}
            onLoad={(map) => setGmap(map)}
            onClick={handleMapClick}
          />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={3} />
      ) : geofences.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState illustration="radar" title="No geofences defined" description="Add a zone to start monitoring vehicle entry and exit points." />
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Radius</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {geofences.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: g.color }} />
                        <span className="font-medium">{g.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {g.center_lat.toFixed(4)}, {g.center_lng.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-sm">{g.radius_meters.toLocaleString()} m</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{g.description || '—'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { GEOFENCE_COLORS };
export default GeofencesTab;
