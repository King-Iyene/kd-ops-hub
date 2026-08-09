import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Plus,
  Loader2,
  FileText,
  ShieldAlert,
  Clock,
  DollarSign,
  Camera,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatDate } from '@/lib/format';

const INCIDENT_TYPES = [
  { value: 'accident', label: 'Road Accident' },
  { value: 'breakdown', label: 'Vehicle Breakdown' },
  { value: 'theft', label: 'Theft' },
  { value: 'vandalism', label: 'Vandalism' },
  { value: 'fire', label: 'Fire' },
  { value: 'other', label: 'Other' },
] as const;

const SEVERITY_LEVELS = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
] as const;

const INSURANCE_STATUSES = [
  { value: 'not_filed', label: 'Not Filed' },
  { value: 'filed', label: 'Filed' },
  { value: 'processing', label: 'Processing' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'settled', label: 'Settled' },
] as const;

const RESOLUTION_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const;

type IncidentType = (typeof INCIDENT_TYPES)[number]['value'];
type Severity = (typeof SEVERITY_LEVELS)[number]['value'];
type InsuranceStatus = (typeof INSURANCE_STATUSES)[number]['value'];
type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number]['value'];

interface Incident {
  id: string;
  vehicle_id: string;
  driver_id: string;
  incident_date: string;
  incident_time: string;
  incident_type: IncidentType;
  severity: Severity;
  location_description: string;
  lat: number | null;
  lng: number | null;
  description: string;
  police_report_number: string | null;
  police_station: string | null;
  insurance_claim_number: string | null;
  insurance_claim_status: InsuranceStatus;
  estimated_repair_cost_ngn: number | null;
  actual_repair_cost_ngn: number | null;
  photo_urls: string[];
  witness_names: string | null;
  third_party_involved: boolean;
  third_party_details: string | null;
  vehicle_driveable: boolean;
  injuries_reported: boolean;
  injury_details: string | null;
  resolution_status: ResolutionStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
}

interface IncidentForm {
  vehicle_id: string;
  driver_id: string;
  incident_date: string;
  incident_time: string;
  incident_type: IncidentType;
  severity: Severity;
  location_description: string;
  description: string;
  police_report_number: string;
  police_station: string;
  witness_names: string;
  third_party_involved: boolean;
  third_party_details: string;
  vehicle_driveable: boolean;
  injuries_reported: boolean;
  injury_details: string;
  estimated_repair_cost_ngn: string;
}

interface Props {
  vehicles: Array<{ id: string; name: string; plate_number: string }>;
  staff: Array<{ id: string; full_name: string }>;
}

const EMPTY_FORM: IncidentForm = {
  vehicle_id: '',
  driver_id: '',
  incident_date: new Date().toISOString().slice(0, 10),
  incident_time: new Date().toTimeString().slice(0, 5),
  incident_type: 'accident',
  severity: 'minor',
  location_description: '',
  description: '',
  police_report_number: '',
  police_station: '',
  witness_names: '',
  third_party_involved: false,
  third_party_details: '',
  vehicle_driveable: true,
  injuries_reported: false,
  injury_details: '',
  estimated_repair_cost_ngn: '',
};

function severityBadge(severity: Severity) {
  const config: Record<Severity, { className: string; label: string }> = {
    critical: { className: 'bg-red-600 hover:bg-red-700 text-white', label: 'Critical' },
    major: { className: 'bg-orange-500 hover:bg-orange-600 text-white', label: 'Major' },
    moderate: { className: 'bg-amber-500 hover:bg-amber-600 text-white', label: 'Moderate' },
    minor: { className: 'bg-gray-400 hover:bg-gray-500 text-white', label: 'Minor' },
  };
  const c = config[severity];
  return <Badge className={c.className}>{c.label}</Badge>;
}

function resolutionBadge(status: ResolutionStatus) {
  const config: Record<ResolutionStatus, { className: string; label: string }> = {
    open: { className: 'bg-red-100 text-red-800 border-red-200', label: 'Open' },
    investigating: { className: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Investigating' },
    resolved: { className: 'bg-green-100 text-green-800 border-green-200', label: 'Resolved' },
    closed: { className: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Closed' },
  };
  const c = config[status];
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

function insuranceBadge(status: InsuranceStatus) {
  const config: Record<InsuranceStatus, { className: string; label: string }> = {
    not_filed: { className: 'bg-gray-100 text-gray-600', label: 'Not Filed' },
    filed: { className: 'bg-blue-100 text-blue-700', label: 'Filed' },
    processing: { className: 'bg-yellow-100 text-yellow-800', label: 'Processing' },
    approved: { className: 'bg-green-100 text-green-700', label: 'Approved' },
    rejected: { className: 'bg-red-100 text-red-700', label: 'Rejected' },
    settled: { className: 'bg-emerald-100 text-emerald-800', label: 'Settled' },
  };
  const c = config[status];
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

function incidentTypeLabel(type: IncidentType): string {
  return INCIDENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function IncidentReportPanel({ vehicles, staff }: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'super_admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'operations';
  const isFieldStaff = profile?.role === 'field_staff' || profile?.role === 'driver';

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasTable, setHasTable] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IncidentForm>({ ...EMPTY_FORM });
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [sortField, setSortField] = useState<'incident_date' | 'severity' | 'created_at'>('incident_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('fleet_incidents').select('*');

      if (isFieldStaff && profile) {
        query = query.eq('driver_id', profile.id);
      }

      const { data, error } = await query.order('incident_date', { ascending: false });
      if (error) throw error;
      setHasTable(true);
      setIncidents(data ?? []);
    } catch {
      setHasTable(false);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [isFieldStaff, profile]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const severityOrder: Record<Severity, number> = { critical: 0, major: 1, moderate: 2, minor: 3 };

  const filtered = incidents
    .filter((inc) => {
      if (filterStatus !== 'all' && inc.resolution_status !== filterStatus) return false;
      if (filterSeverity !== 'all' && inc.severity !== filterSeverity) return false;
      if (filterDateFrom && inc.incident_date < filterDateFrom) return false;
      if (filterDateTo && inc.incident_date > filterDateTo) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const vehicle = vehicleMap.get(inc.vehicle_id);
        const driver = staffMap.get(inc.driver_id);
        const haystack = [
          inc.location_description,
          inc.description,
          inc.police_report_number,
          vehicle?.plate_number,
          vehicle?.name,
          driver?.full_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'incident_date') {
        cmp = a.incident_date.localeCompare(b.incident_date) || (a.incident_time ?? '').localeCompare(b.incident_time ?? '');
      } else if (sortField === 'severity') {
        cmp = severityOrder[a.severity] - severityOrder[b.severity];
      } else {
        cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const totalIncidents = incidents.length;
  const openCases = incidents.filter((i) => i.resolution_status === 'open' || i.resolution_status === 'investigating').length;
  const insurancePending = incidents.filter((i) => i.insurance_claim_status === 'filed' || i.insurance_claim_status === 'processing').length;
  const totalRepairCost = incidents.reduce(
    (sum, i) => sum + (i.actual_repair_cost_ngn ?? i.estimated_repair_cost_ngn ?? 0),
    0,
  );

  async function uploadPhotos(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `incidents/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('fleet-photos').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
      const { data: urlData } = supabase.storage.from('fleet-photos').getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  }

  async function handleSubmit() {
    if (!profile) return;
    if (!form.vehicle_id || !form.driver_id || !form.location_description || !form.description) {
      toast({ title: 'Missing fields', description: 'Vehicle, driver, location and description are required.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      let photoUrls: string[] = [];
      if (photoFiles.length > 0) {
        setUploadingPhotos(true);
        photoUrls = await uploadPhotos(photoFiles);
        setUploadingPhotos(false);
      }

      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        incident_date: form.incident_date,
        incident_time: form.incident_time,
        incident_type: form.incident_type,
        severity: form.severity,
        location_description: form.location_description,
        description: form.description,
        police_report_number: form.police_report_number || null,
        police_station: form.police_station || null,
        witness_names: form.witness_names || null,
        third_party_involved: form.third_party_involved,
        third_party_details: form.third_party_involved ? form.third_party_details || null : null,
        vehicle_driveable: form.vehicle_driveable,
        injuries_reported: form.injuries_reported,
        injury_details: form.injuries_reported ? form.injury_details || null : null,
        estimated_repair_cost_ngn: form.estimated_repair_cost_ngn ? parseFloat(form.estimated_repair_cost_ngn) : null,
        photo_urls: photoUrls,
        insurance_claim_status: 'not_filed',
        resolution_status: 'open',
        created_by: profile.id,
      };

      const { error } = await supabase.from('fleet_incidents').insert(payload);
      if (error) throw error;

      toast({ title: 'Incident reported', description: 'The incident has been logged successfully.' });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setPhotoFiles([]);
      fetchIncidents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit incident report';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
      setUploadingPhotos(false);
    }
  }

  async function updateResolutionStatus(incidentId: string, status: ResolutionStatus) {
    if (!profile) return;
    setUpdatingStatus(true);
    try {
      const updates: Record<string, unknown> = { resolution_status: status };
      if (status === 'resolved' || status === 'closed') {
        updates.resolved_by = profile.id;
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase.from('fleet_incidents').update(updates).eq('id', incidentId);
      if (error) throw error;
      toast({ title: 'Status updated' });
      fetchIncidents();
      if (selectedIncident?.id === incidentId) {
        setSelectedIncident((prev) => (prev ? { ...prev, resolution_status: status, ...(status === 'resolved' || status === 'closed' ? { resolved_by: profile.id, resolved_at: new Date().toISOString() } : {}) } : null));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function updateInsuranceStatus(incidentId: string, status: InsuranceStatus, claimNumber?: string) {
    setUpdatingStatus(true);
    try {
      const updates: Record<string, unknown> = { insurance_claim_status: status };
      if (claimNumber !== undefined) updates.insurance_claim_number = claimNumber || null;
      const { error } = await supabase.from('fleet_incidents').update(updates).eq('id', incidentId);
      if (error) throw error;
      toast({ title: 'Insurance status updated' });
      fetchIncidents();
      if (selectedIncident?.id === incidentId) {
        setSelectedIncident((prev) => (prev ? { ...prev, insurance_claim_status: status, ...(claimNumber !== undefined ? { insurance_claim_number: claimNumber || null } : {}) } : null));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function updateActualCost(incidentId: string, cost: number) {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase.from('fleet_incidents').update({ actual_repair_cost_ngn: cost }).eq('id', incidentId);
      if (error) throw error;
      toast({ title: 'Repair cost updated' });
      fetchIncidents();
      if (selectedIncident?.id === incidentId) {
        setSelectedIncident((prev) => (prev ? { ...prev, actual_repair_cost_ngn: cost } : null));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function updateResolutionNotes(incidentId: string, notes: string) {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase.from('fleet_incidents').update({ resolution_notes: notes }).eq('id', incidentId);
      if (error) throw error;
      toast({ title: 'Notes saved' });
      if (selectedIncident?.id === incidentId) {
        setSelectedIncident((prev) => (prev ? { ...prev, resolution_notes: notes } : null));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return null;
    return sortDir === 'desc' ? <ChevronDown className="inline h-3 w-3 ml-1" /> : <ChevronUp className="inline h-3 w-3 ml-1" />;
  }

  function openDetail(incident: Incident) {
    setSelectedIncident(incident);
    setShowDetail(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasTable) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Incident reporting module requires the latest migration. Deploy the <code>fleet_incidents_lifecycle_training</code> migration to enable this feature.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Incidents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIncidents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Cases</CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{openCases}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Insurance Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{insurancePending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Repair Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(totalRepairCost)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {RESOLUTION_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Severity</Label>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {SEVERITY_LEVELS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-[150px] h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-[150px] h-9"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-[200px] h-9"
            />
          </div>

          {(filterStatus !== 'all' || filterSeverity !== 'all' || filterDateFrom || filterDateTo || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setFilterStatus('all');
                setFilterSeverity('all');
                setFilterDateFrom('');
                setFilterDateTo('');
                setSearchQuery('');
              }}
            >
              <Filter className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <Button onClick={() => { setForm({ ...EMPTY_FORM, driver_id: isFieldStaff && profile ? profile.id : '' }); setPhotoFiles([]); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Report Incident
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              {incidents.length === 0
                ? 'No incidents have been reported yet.'
                : 'No incidents match the current filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('incident_date')}
                  >
                    Date <SortIcon field="incident_date" />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('severity')}
                  >
                    Severity <SortIcon field="severity" />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inc) => {
                  const vehicle = vehicleMap.get(inc.vehicle_id);
                  const driver = staffMap.get(inc.driver_id);
                  return (
                    <TableRow
                      key={inc.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openDetail(inc)}
                    >
                      <TableCell className="whitespace-nowrap">{formatDate(inc.incident_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{incidentTypeLabel(inc.incident_type)}</TableCell>
                      <TableCell>
                        <div className="text-sm">{vehicle?.name ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{vehicle?.plate_number}</div>
                      </TableCell>
                      <TableCell>{driver?.full_name ?? 'Unknown'}</TableCell>
                      <TableCell>{severityBadge(inc.severity)}</TableCell>
                      <TableCell>{resolutionBadge(inc.resolution_status)}</TableCell>
                      <TableCell>{insuranceBadge(inc.insurance_claim_status)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {inc.estimated_repair_cost_ngn != null ? formatNaira(inc.estimated_repair_cost_ngn) : '--'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Fleet Incident</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Driver</Label>
                <Select
                  value={form.driver_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, driver_id: v }))}
                  disabled={isFieldStaff}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.incident_date}
                  onChange={(e) => setForm((f) => ({ ...f, incident_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={form.incident_time}
                  onChange={(e) => setForm((f) => ({ ...f, incident_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.incident_type} onValueChange={(v) => setForm((f) => ({ ...f, incident_type: v as IncidentType }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v as Severity }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Repair Cost (NGN)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 250000"
                  value={form.estimated_repair_cost_ngn}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_repair_cost_ngn: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location (road, LGA, state)</Label>
              <Input
                placeholder="e.g. Lekki-Epe Expressway, Ajah, Lagos"
                value={form.location_description}
                onChange={(e) => setForm((f) => ({ ...f, location_description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Description of Incident</Label>
              <Textarea
                placeholder="Provide detailed account of what happened..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>FRSC / Police Report Number</Label>
                <Input
                  placeholder="e.g. FRN/LA/2026/0847"
                  value={form.police_report_number}
                  onChange={(e) => setForm((f) => ({ ...f, police_report_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Police Station</Label>
                <Input
                  placeholder="e.g. Ajah Police Station"
                  value={form.police_station}
                  onChange={(e) => setForm((f) => ({ ...f, police_station: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Witness Names</Label>
              <Input
                placeholder="Names of witnesses, separated by commas"
                value={form.witness_names}
                onChange={(e) => setForm((f) => ({ ...f, witness_names: e.target.value }))}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="third_party"
                  checked={form.third_party_involved}
                  onChange={(e) => setForm((f) => ({ ...f, third_party_involved: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="third_party" className="cursor-pointer">Third party involved</Label>
              </div>
              {form.third_party_involved && (
                <Textarea
                  placeholder="Third party vehicle details, plate number, driver name, insurance info..."
                  value={form.third_party_details}
                  onChange={(e) => setForm((f) => ({ ...f, third_party_details: e.target.value }))}
                  rows={2}
                />
              )}
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="vehicle_driveable"
                  checked={form.vehicle_driveable}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_driveable: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="vehicle_driveable" className="cursor-pointer">Vehicle is still driveable</Label>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="injuries"
                  checked={form.injuries_reported}
                  onChange={(e) => setForm((f) => ({ ...f, injuries_reported: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="injuries" className="cursor-pointer">Injuries reported</Label>
              </div>
              {form.injuries_reported && (
                <Textarea
                  placeholder="Description of injuries and persons affected..."
                  value={form.injury_details}
                  onChange={(e) => setForm((f) => ({ ...f, injury_details: e.target.value }))}
                  rows={2}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Photos / Evidence</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photos
                </Button>
                <span className="text-sm text-muted-foreground">
                  {photoFiles.length > 0 ? `${photoFiles.length} file(s) selected` : 'No photos added'}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setPhotoFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
              {photoFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {photoFiles.map((file, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Evidence ${idx + 1}`}
                        className="h-16 w-16 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadingPhotos ? 'Uploading photos...' : 'Submitting...'}
                </>
              ) : (
                'Submit Report'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IncidentDetailDialog
        incident={selectedIncident}
        open={showDetail}
        onOpenChange={setShowDetail}
        vehicleMap={vehicleMap}
        staffMap={staffMap}
        isAdmin={isAdmin}
        updating={updatingStatus}
        onUpdateResolution={updateResolutionStatus}
        onUpdateInsurance={updateInsuranceStatus}
        onUpdateActualCost={updateActualCost}
        onUpdateResolutionNotes={updateResolutionNotes}
      />
    </div>
  );
}

function IncidentDetailDialog({
  incident,
  open,
  onOpenChange,
  vehicleMap,
  staffMap,
  isAdmin,
  updating,
  onUpdateResolution,
  onUpdateInsurance,
  onUpdateActualCost,
  onUpdateResolutionNotes,
}: {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleMap: Map<string, { id: string; name: string; plate_number: string }>;
  staffMap: Map<string, { id: string; full_name: string }>;
  isAdmin: boolean;
  updating: boolean;
  onUpdateResolution: (id: string, status: ResolutionStatus) => void;
  onUpdateInsurance: (id: string, status: InsuranceStatus, claimNumber?: string) => void;
  onUpdateActualCost: (id: string, cost: number) => void;
  onUpdateResolutionNotes: (id: string, notes: string) => void;
}) {
  const [editClaimNumber, setEditClaimNumber] = useState('');
  const [editActualCost, setEditActualCost] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (incident) {
      setEditClaimNumber(incident.insurance_claim_number ?? '');
      setEditActualCost(incident.actual_repair_cost_ngn?.toString() ?? '');
      setEditNotes(incident.resolution_notes ?? '');
    }
  }, [incident]);

  if (!incident) return null;

  const vehicle = vehicleMap.get(incident.vehicle_id);
  const driver = staffMap.get(incident.driver_id);
  const resolvedBy = incident.resolved_by ? staffMap.get(incident.resolved_by) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Incident Report
            <span className="ml-auto flex gap-2">
              {severityBadge(incident.severity)}
              {resolutionBadge(incident.resolution_status)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailField label="Date" value={formatDate(incident.incident_date)} />
            <DetailField label="Time" value={incident.incident_time ?? '--'} />
            <DetailField label="Type" value={incidentTypeLabel(incident.incident_type)} />
            <DetailField label="Vehicle" value={vehicle ? `${vehicle.name} (${vehicle.plate_number})` : 'Unknown'} />
            <DetailField label="Driver" value={driver?.full_name ?? 'Unknown'} />
            <DetailField label="Vehicle Driveable" value={incident.vehicle_driveable ? 'Yes' : 'No'} />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Location</p>
            <p className="text-sm">{incident.location_description}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
            <p className="text-sm whitespace-pre-wrap">{incident.description}</p>
          </div>

          {(incident.police_report_number || incident.police_station) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="FRSC / Police Report No." value={incident.police_report_number} />
              <DetailField label="Police Station" value={incident.police_station} />
            </div>
          )}

          {incident.witness_names && (
            <DetailField label="Witnesses" value={incident.witness_names} />
          )}

          {incident.third_party_involved && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:bg-amber-950/20 dark:border-amber-800">
              <p className="text-sm font-medium mb-1">Third Party Involved</p>
              <p className="text-sm">{incident.third_party_details || 'No details provided'}</p>
            </div>
          )}

          {incident.injuries_reported && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:bg-red-950/20 dark:border-red-800">
              <p className="text-sm font-medium mb-1 text-red-800 dark:text-red-400">Injuries Reported</p>
              <p className="text-sm">{incident.injury_details || 'No details provided'}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Estimated Repair Cost" value={incident.estimated_repair_cost_ngn != null ? formatNaira(incident.estimated_repair_cost_ngn) : '--'} />
            <DetailField label="Actual Repair Cost" value={incident.actual_repair_cost_ngn != null ? formatNaira(incident.actual_repair_cost_ngn) : '--'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Insurance Status" value={null}>
              {insuranceBadge(incident.insurance_claim_status)}
            </DetailField>
            <DetailField label="Claim Number" value={incident.insurance_claim_number} />
          </div>

          {incident.photo_urls && incident.photo_urls.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Evidence Photos</p>
              <div className="flex flex-wrap gap-2">
                {incident.photo_urls.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`Evidence ${idx + 1}`}
                      className="h-20 w-20 object-cover rounded border hover:opacity-80 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {incident.resolution_notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Resolution Notes</p>
              <p className="text-sm whitespace-pre-wrap">{incident.resolution_notes}</p>
            </div>
          )}

          {resolvedBy && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Resolved By" value={resolvedBy.full_name} />
              <DetailField label="Resolved At" value={incident.resolved_at ? formatDate(incident.resolved_at) : '--'} />
            </div>
          )}

          <DetailField label="Reported" value={formatDate(incident.created_at)} />

          {isAdmin && (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm font-semibold">Admin Actions</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Resolution Status</Label>
                  <Select
                    value={incident.resolution_status}
                    onValueChange={(v) => onUpdateResolution(incident.id, v as ResolutionStatus)}
                    disabled={updating}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTION_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Insurance Claim Status</Label>
                  <Select
                    value={incident.insurance_claim_status}
                    onValueChange={(v) => onUpdateInsurance(incident.id, v as InsuranceStatus, editClaimNumber)}
                    disabled={updating}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSURANCE_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Insurance Claim Number</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. CLM-2026-0042"
                      value={editClaimNumber}
                      onChange={(e) => setEditClaimNumber(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updating}
                      onClick={() => onUpdateInsurance(incident.id, incident.insurance_claim_status, editClaimNumber)}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Actual Repair Cost (NGN)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="e.g. 350000"
                      value={editActualCost}
                      onChange={(e) => setEditActualCost(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updating || !editActualCost}
                      onClick={() => onUpdateActualCost(incident.id, parseFloat(editActualCost))}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Resolution Notes</Label>
                <Textarea
                  placeholder="Notes on investigation findings, resolution actions taken..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updating}
                  onClick={() => onUpdateResolutionNotes(incident.id, editNotes)}
                >
                  Save Notes
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children ?? <p className="text-sm mt-0.5">{value || '--'}</p>}
    </div>
  );
}
