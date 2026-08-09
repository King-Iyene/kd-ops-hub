import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogDescription,
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
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  Loader2,
  Search,
  ShieldCheck,
  Truck,
  Eye,
  Plus,
  Wrench,
} from 'lucide-react';
import { VehicleInspectionForm } from '@/components/fleet/VehicleInspectionForm';

interface Props {
  vehicles: Array<{ id: string; name: string; plate_number: string }>;
}

interface ChecklistItem {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'na';
  note?: string;
}

interface Inspection {
  id: string;
  vehicle_id: string;
  inspector_id: string;
  trip_id: string | null;
  inspection_type: string;
  checklist: { items: ChecklistItem[] } | null;
  has_defects: boolean;
  defect_notes: string | null;
  photo_urls: string[] | null;
  odometer_km: number | null;
  overall_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  inspector_name?: string;
  reviewer_name?: string;
}

type FilterType = 'all' | 'pre_trip' | 'post_trip' | 'ad_hoc';
type FilterStatus = 'all' | 'pass' | 'fail';
type ActiveTab = 'history' | 'defects' | 'vehicles';

const TYPE_LABELS: Record<string, string> = {
  pre_trip: 'Pre-Trip',
  post_trip: 'Post-Trip',
  ad_hoc: 'Ad Hoc',
};

export function InspectionHistory({ vehicles }: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'super_admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'operations';

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterVehicle, setFilterVehicle] = useState('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolvingInspection, setResolvingInspection] = useState<Inspection | null>(null);
  const [resolveForm, setResolveForm] = useState({
    action_taken: '',
    resolution_note: '',
    cost_ngn: '',
  });
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('history');

  const [inspectVehicleId, setInspectVehicleId] = useState('');
  const [showInspectForm, setShowInspectForm] = useState(false);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);

  const vehicleMap = useMemo(() => {
    const m = new Map<string, { name: string; plate_number: string }>();
    for (const v of vehicles) {
      m.set(v.id, { name: v.name, plate_number: v.plate_number });
    }
    return m;
  }, [vehicles]);

  const fetchInspections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data: Inspection[];
      try {
        const { data: rich, error: richErr } = await supabase
          .from('vehicle_inspections')
          .select(
            '*, inspector:profiles!inspector_id(full_name), reviewer:profiles!reviewed_by(full_name)',
          )
          .order('created_at', { ascending: false });
        if (richErr) throw richErr;
        data = (rich ?? []).map((r: any) => ({
          ...r,
          inspector_name: r.inspector?.full_name ?? null,
          reviewer_name: r.reviewer?.full_name ?? null,
          inspector: undefined,
          reviewer: undefined,
        }));
      } catch {
        const { data: plain, error: plainErr } = await supabase
          .from('vehicle_inspections')
          .select('*')
          .order('created_at', { ascending: false });
        if (plainErr) throw plainErr;
        data = (plain ?? []).map((r: any) => ({
          ...r,
          inspector_name: null,
          reviewer_name: null,
        }));
      }
      setInspections(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load inspections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections]);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);

  const recentInspections = useMemo(
    () => inspections.filter((i) => i.created_at >= thirtyDaysAgo),
    [inspections, thirtyDaysAgo],
  );

  const passRate = useMemo(() => {
    if (recentInspections.length === 0) return 0;
    const passed = recentInspections.filter((i) => i.overall_status === 'pass').length;
    return Math.round((passed / recentInspections.length) * 100);
  }, [recentInspections]);

  const openDefects = useMemo(
    () => inspections.filter((i) => i.has_defects && !i.reviewed_at),
    [inspections],
  );

  const vehiclesInspected = useMemo(() => {
    const ids = new Set(recentInspections.map((i) => i.vehicle_id));
    return ids.size;
  }, [recentInspections]);

  const filtered = useMemo(() => {
    return inspections.filter((i) => {
      if (filterVehicle !== 'all' && i.vehicle_id !== filterVehicle) return false;
      if (filterType !== 'all' && i.inspection_type !== filterType) return false;
      if (filterStatus !== 'all' && i.overall_status !== filterStatus) return false;
      if (filterDateFrom && i.created_at < filterDateFrom) return false;
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setDate(to.getDate() + 1);
        if (i.created_at >= to.toISOString()) return false;
      }
      return true;
    });
  }, [inspections, filterVehicle, filterType, filterStatus, filterDateFrom, filterDateTo]);

  const lastInspectionByVehicle = useMemo(() => {
    const map = new Map<string, Inspection>();
    for (const i of inspections) {
      if (!map.has(i.vehicle_id)) {
        map.set(i.vehicle_id, i);
      }
    }
    return map;
  }, [inspections]);

  const openDetail = (inspection: Inspection) => {
    setSelectedInspection(inspection);
    setDetailOpen(true);
  };

  const openResolveDialog = (inspection: Inspection) => {
    setResolvingInspection(inspection);
    setResolveForm({ action_taken: '', resolution_note: '', cost_ngn: '' });
    setResolveOpen(true);
    setDetailOpen(false);
  };

  const submitResolve = async () => {
    if (!resolvingInspection || !profile) return;
    if (!resolveForm.action_taken.trim()) {
      toast({ title: 'Please describe what was done to fix the issue', variant: 'destructive' });
      return;
    }
    setSubmittingResolve(true);
    try {
      const note = [
        `Action taken: ${resolveForm.action_taken.trim()}`,
        resolveForm.cost_ngn ? `Repair cost: ₦${parseFloat(resolveForm.cost_ngn).toLocaleString()}` : null,
        resolveForm.resolution_note.trim() ? `Notes: ${resolveForm.resolution_note.trim()}` : null,
      ].filter(Boolean).join('\n');

      const { error: err } = await supabase
        .from('vehicle_inspections')
        .update({
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          review_note: note,
        })
        .eq('id', resolvingInspection.id);
      if (err) throw err;
      toast({ title: 'Defect resolved', description: 'The issue has been marked as fixed.' });
      setResolveOpen(false);
      setResolvingInspection(null);
      fetchInspections();
    } catch (err: any) {
      toast({
        title: 'Failed to resolve',
        description: err?.message ?? 'Could not save resolution.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingResolve(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={AlertTriangle}
            title="Failed to load inspections"
            description={error}
            tone="danger"
            action={
              <Button variant="outline" size="sm" onClick={fetchInspections}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Inspections (30d)"
          value={loading ? '...' : recentInspections.length}
          icon={ClipboardCheck}
          tone="primary"
        />
        <StatCard
          title="Pass Rate"
          value={loading ? '...' : `${passRate}%`}
          icon={ShieldCheck}
          tone={passRate >= 80 ? 'success' : passRate >= 50 ? 'warning' : 'danger'}
        />
        <StatCard
          title="Open Defects"
          value={loading ? '...' : openDefects.length}
          icon={AlertTriangle}
          tone={openDefects.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="Vehicles Inspected"
          value={loading ? '...' : vehiclesInspected}
          icon={Truck}
          subtitle={`of ${vehicles.length} total`}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-b">
        <div className="flex gap-1">
          {(['history', 'defects', 'vehicles'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'history' && 'Inspection History'}
              {tab === 'defects' && `Open Defects (${openDefects.length})`}
              {tab === 'vehicles' && 'Vehicle Summary'}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => setShowVehiclePicker(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Start Inspection
        </Button>
      </div>

      {activeTab === 'history' && (
        <HistoryTab
          inspections={filtered}
          loading={loading}
          vehicleMap={vehicleMap}
          vehicles={vehicles}
          filterVehicle={filterVehicle}
          setFilterVehicle={setFilterVehicle}
          filterType={filterType}
          setFilterType={setFilterType}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterDateFrom={filterDateFrom}
          setFilterDateFrom={setFilterDateFrom}
          filterDateTo={filterDateTo}
          setFilterDateTo={setFilterDateTo}
          onOpenDetail={openDetail}
        />
      )}

      {activeTab === 'defects' && (
        <DefectsTab
          defects={openDefects}
          loading={loading}
          vehicleMap={vehicleMap}
          onResolve={openResolveDialog}
          onOpenDetail={openDetail}
        />
      )}

      {activeTab === 'vehicles' && (
        <VehicleSummaryTab
          vehicles={vehicles}
          lastInspectionByVehicle={lastInspectionByVehicle}
          loading={loading}
        />
      )}

      <InspectionDetailDialog
        inspection={selectedInspection}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        vehicleMap={vehicleMap}
        onResolve={openResolveDialog}
      />

      {/* ── Resolve Defect Dialog ── */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Resolve Defect
            </DialogTitle>
            <DialogDescription>
              {resolvingInspection && (() => {
                const veh = vehicleMap.get(resolvingInspection.vehicle_id);
                const failedItems = resolvingInspection.checklist?.items?.filter((item) => item.status === 'fail') ?? [];
                return (
                  <span className="block mt-1">
                    {veh ? `${veh.name} (${veh.plate_number})` : 'Vehicle'}
                    {failedItems.length > 0 && ` — ${failedItems.map((i) => i.label).join(', ')}`}
                  </span>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>What was done to fix it? <span className="text-destructive">*</span></Label>
              <Select
                value={resolveForm.action_taken}
                onValueChange={(v) => setResolveForm({ ...resolveForm, action_taken: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action taken" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Repaired in-house">Repaired in-house</SelectItem>
                  <SelectItem value="Sent to mechanic">Sent to mechanic</SelectItem>
                  <SelectItem value="Part replaced">Part replaced</SelectItem>
                  <SelectItem value="Topped up / refilled">Topped up / refilled</SelectItem>
                  <SelectItem value="Cleaned / adjusted">Cleaned / adjusted</SelectItem>
                  <SelectItem value="Scheduled for later repair">Scheduled for later repair</SelectItem>
                  <SelectItem value="Not a real defect (false alarm)">Not a real defect (false alarm)</SelectItem>
                  <SelectItem value="Other">Other (describe below)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Repair cost (optional)</Label>
              <Input
                type="number"
                placeholder="₦ 0"
                value={resolveForm.cost_ngn}
                onChange={(e) => setResolveForm({ ...resolveForm, cost_ngn: e.target.value })}
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Additional notes</Label>
              <Textarea
                placeholder="Any extra detail — mechanic name, part number, warranty info..."
                value={resolveForm.resolution_note}
                onChange={(e) => setResolveForm({ ...resolveForm, resolution_note: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button
              onClick={submitResolve}
              disabled={submittingResolve || !resolveForm.action_taken}
            >
              {submittingResolve ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vehicle picker for starting a new inspection */}
      <Dialog open={showVehiclePicker} onOpenChange={setShowVehiclePicker}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Vehicle to Inspect</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={inspectVehicleId} onValueChange={setInspectVehicleId}>
              <SelectTrigger><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} ({v.plate_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVehiclePicker(false)}>Cancel</Button>
            <Button
              disabled={!inspectVehicleId}
              onClick={() => {
                setShowVehiclePicker(false);
                setShowInspectForm(true);
              }}
            >
              Begin Inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {inspectVehicleId && (
        <VehicleInspectionForm
          vehicleId={inspectVehicleId}
          vehicleName={(() => {
            const v = vehicleMap.get(inspectVehicleId);
            return v ? `${v.name} (${v.plate_number})` : 'Vehicle';
          })()}
          inspectionType="ad_hoc"
          open={showInspectForm}
          onOpenChange={setShowInspectForm}
          onComplete={() => {
            setShowInspectForm(false);
            setInspectVehicleId('');
            fetchInspections();
          }}
        />
      )}
    </div>
  );
}

function HistoryTab({
  inspections,
  loading,
  vehicleMap,
  vehicles,
  filterVehicle,
  setFilterVehicle,
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  onOpenDetail,
}: {
  inspections: Inspection[];
  loading: boolean;
  vehicleMap: Map<string, { name: string; plate_number: string }>;
  vehicles: Array<{ id: string; name: string; plate_number: string }>;
  filterVehicle: string;
  setFilterVehicle: (v: string) => void;
  filterType: FilterType;
  setFilterType: (v: FilterType) => void;
  filterStatus: FilterStatus;
  setFilterStatus: (v: FilterStatus) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  onOpenDetail: (i: Inspection) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inspection History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger>
              <SelectValue placeholder="All Vehicles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name} ({v.plate_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pre_trip">Pre-Trip</SelectItem>
              <SelectItem value="post_trip">Post-Trip</SelectItem>
              <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(v as FilterStatus)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            placeholder="From"
            className="text-sm"
          />
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            placeholder="To"
            className="text-sm"
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : inspections.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No inspections found"
            description="Adjust your filters or wait for new inspections to be submitted."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="hidden md:table-cell">Inspector</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Defects</TableHead>
                  <TableHead className="hidden sm:table-cell">Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((i) => {
                  const veh = vehicleMap.get(i.vehicle_id);
                  return (
                    <TableRow
                      key={i.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onOpenDetail(i)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(i.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {veh ? `${veh.name} (${veh.plate_number})` : i.vehicle_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {i.inspector_name ?? i.inspector_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[i.inspection_type] ?? i.inspection_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={i.overall_status === 'pass' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {i.overall_status === 'pass' ? 'Pass' : 'Fail'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {i.has_defects ? (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <span className="text-muted-foreground text-xs">None</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {i.reviewed_at ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-muted-foreground text-xs">Pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DefectsTab({
  defects,
  loading,
  vehicleMap,
  onResolve,
  onOpenDetail,
}: {
  defects: Inspection[];
  loading: boolean;
  vehicleMap: Map<string, { name: string; plate_number: string }>;
  onResolve: (i: Inspection) => void;
  onOpenDetail: (i: Inspection) => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <TableSkeleton rows={4} cols={5} />
        </CardContent>
      </Card>
    );
  }

  if (defects.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={ShieldCheck}
            title="No open defects"
            description="All reported defects have been resolved. Great work."
            tone="success"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {defects.map((d) => {
        const veh = vehicleMap.get(d.vehicle_id);
        const failedItems = d.checklist?.items?.filter((item) => item.status === 'fail') ?? [];
        return (
          <Card key={d.id} className="border-amber-200 dark:border-amber-800/50">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {veh ? `${veh.name} (${veh.plate_number})` : d.vehicle_id.slice(0, 8)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[d.inspection_type] ?? d.inspection_type}
                    </Badge>
                    <Badge variant="destructive" className="text-xs">Fail</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(d.created_at)}
                    {d.inspector_name && ` by ${d.inspector_name}`}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenDetail(d)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onResolve(d)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Wrench className="h-4 w-4 mr-1" />
                    Resolve
                  </Button>
                </div>
              </div>

              {failedItems.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {failedItems.map((item) => (
                    <Badge
                      key={item.key}
                      variant="outline"
                      className="text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800"
                    >
                      {item.label}
                    </Badge>
                  ))}
                </div>
              )}

              {d.defect_notes && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  {d.defect_notes}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VehicleSummaryTab({
  vehicles,
  lastInspectionByVehicle,
  loading,
}: {
  vehicles: Array<{ id: string; name: string; plate_number: string }>;
  lastInspectionByVehicle: Map<string, Inspection>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <TableSkeleton rows={6} cols={4} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Per-Vehicle Inspection Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Plate</TableHead>
                <TableHead>Last Inspection</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v) => {
                const last = lastInspectionByVehicle.get(v.id);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm font-medium">{v.name}</TableCell>
                    <TableCell className="text-sm">{v.plate_number}</TableCell>
                    <TableCell className="text-sm">
                      {last ? formatDate(last.created_at) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {last ? (
                        <Badge
                          variant={last.overall_status === 'pass' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {last.overall_status === 'pass' ? 'Pass' : 'Fail'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">No Data</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function InspectionDetailDialog({
  inspection,
  open,
  onOpenChange,
  vehicleMap,
  onResolve,
}: {
  inspection: Inspection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleMap: Map<string, { name: string; plate_number: string }>;
  onResolve: (i: Inspection) => void;
}) {
  if (!inspection) return null;

  const veh = vehicleMap.get(inspection.vehicle_id);
  const items = inspection.checklist?.items ?? [];
  const failCount = items.filter((i) => i.status === 'fail').length;
  const passCount = items.filter((i) => i.status === 'pass').length;
  const naCount = items.filter((i) => i.status === 'na').length;
  const hasUnresolvedDefect = inspection.has_defects && !inspection.reviewed_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Inspection Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Vehicle</span>
              <p className="font-medium">
                {veh ? `${veh.name} (${veh.plate_number})` : inspection.vehicle_id.slice(0, 8)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Date</span>
              <p className="font-medium">{formatDate(inspection.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Inspector</span>
              <p className="font-medium">
                {inspection.inspector_name ?? inspection.inspector_id.slice(0, 8)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium">
                {TYPE_LABELS[inspection.inspection_type] ?? inspection.inspection_type}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p>
                <Badge
                  variant={inspection.overall_status === 'pass' ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {inspection.overall_status === 'pass' ? 'Pass' : 'Fail'}
                </Badge>
              </p>
            </div>
            {inspection.odometer_km != null && (
              <div>
                <span className="text-muted-foreground">Odometer</span>
                <p className="font-medium">{inspection.odometer_km.toLocaleString()} km</p>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h4 className="text-sm font-semibold">Checklist</h4>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">{passCount} pass</span>
                  <span className="text-rose-600 dark:text-rose-400">{failCount} fail</span>
                  <span>{naCount} n/a</span>
                </div>
              </div>
              <div className="border rounded-lg divide-y">
                {items.map((item) => (
                  <div
                    key={item.key}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2 text-sm',
                      item.status === 'fail' && 'bg-rose-50 dark:bg-rose-950/30',
                    )}
                  >
                    {item.status === 'pass' && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    )}
                    {item.status === 'fail' && (
                      <XCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                    )}
                    {item.status === 'na' && (
                      <MinusCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={cn(item.status === 'fail' && 'font-medium text-rose-700 dark:text-rose-300')}>
                        {item.label}
                      </span>
                      {item.note && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inspection.defect_notes && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Defect Notes</h4>
              <p className="text-sm bg-muted/50 rounded-md px-3 py-2">{inspection.defect_notes}</p>
            </div>
          )}

          {inspection.photo_urls && inspection.photo_urls.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Photos</h4>
              <div className="grid grid-cols-3 gap-2">
                {inspection.photo_urls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden border bg-muted"
                  >
                    <img
                      src={url}
                      alt={`Inspection photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {inspection.reviewed_at && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Resolved
              </h4>
              <div className="text-sm text-muted-foreground">
                <p>
                  {inspection.reviewer_name ?? inspection.reviewed_by?.slice(0, 8) ?? 'Unknown'}
                  {' on '}
                  {formatDate(inspection.reviewed_at)}
                </p>
                {inspection.review_note && (
                  <p className="mt-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-md px-3 py-2 text-emerald-800 dark:text-emerald-300 whitespace-pre-line">
                    {inspection.review_note}
                  </p>
                )}
              </div>
            </div>
          )}

          {hasUnresolvedDefect && (
            <div className="border-t pt-3">
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">This inspection has unresolved defects</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Record what was done to fix the issue</p>
                </div>
                <Button
                  onClick={() => onResolve(inspection)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  <Wrench className="h-4 w-4 mr-1" />
                  Resolve
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
