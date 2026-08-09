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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

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
  const [reviewNote, setReviewNote] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('history');

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
    setReviewNote(inspection.review_note ?? '');
    setDetailOpen(true);
  };

  const submitReview = async () => {
    if (!selectedInspection || !profile) return;
    setSubmittingReview(true);
    try {
      const { error: err } = await supabase
        .from('vehicle_inspections')
        .update({
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote.trim() || null,
        })
        .eq('id', selectedInspection.id);
      if (err) throw err;
      toast({ title: 'Inspection reviewed', description: 'Defect review recorded.' });
      setDetailOpen(false);
      fetchInspections();
    } catch (err: any) {
      toast({
        title: 'Review failed',
        description: err?.message ?? 'Could not save review.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const resolveDefect = async (inspection: Inspection, note: string) => {
    if (!profile) return;
    try {
      const { error: err } = await supabase
        .from('vehicle_inspections')
        .update({
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          review_note: note.trim() || 'Defect resolved',
        })
        .eq('id', inspection.id);
      if (err) throw err;
      toast({ title: 'Defect resolved', description: 'Marked as reviewed.' });
      fetchInspections();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message ?? 'Could not resolve defect.',
        variant: 'destructive',
      });
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

      <div className="flex gap-1 border-b">
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
          isAdmin={isAdmin}
          onResolve={resolveDefect}
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
        isAdmin={isAdmin}
        reviewNote={reviewNote}
        setReviewNote={setReviewNote}
        submitting={submittingReview}
        onSubmitReview={submitReview}
      />
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
  isAdmin,
  onResolve,
  onOpenDetail,
}: {
  defects: Inspection[];
  loading: boolean;
  vehicleMap: Map<string, { name: string; plate_number: string }>;
  isAdmin: boolean;
  onResolve: (i: Inspection, note: string) => Promise<void>;
  onOpenDetail: (i: Inspection) => void;
}) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});

  const handleResolve = async (inspection: Inspection) => {
    setResolvingId(inspection.id);
    await onResolve(inspection, resolveNotes[inspection.id] ?? '');
    setResolvingId(null);
    setResolveNotes((prev) => {
      const next = { ...prev };
      delete next[inspection.id];
      return next;
    });
  };

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
            description="All reported defects have been reviewed. Great work."
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenDetail(d)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
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

              {isAdmin && (
                <div className="flex gap-2 items-end">
                  <Textarea
                    placeholder="Resolution notes..."
                    value={resolveNotes[d.id] ?? ''}
                    onChange={(e) =>
                      setResolveNotes((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    rows={2}
                    className="text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleResolve(d)}
                    disabled={resolvingId === d.id}
                  >
                    {resolvingId === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Resolve'
                    )}
                  </Button>
                </div>
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
  isAdmin,
  reviewNote,
  setReviewNote,
  submitting,
  onSubmitReview,
}: {
  inspection: Inspection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleMap: Map<string, { name: string; plate_number: string }>;
  isAdmin: boolean;
  reviewNote: string;
  setReviewNote: (v: string) => void;
  submitting: boolean;
  onSubmitReview: () => void;
}) {
  if (!inspection) return null;

  const veh = vehicleMap.get(inspection.vehicle_id);
  const items = inspection.checklist?.items ?? [];
  const failCount = items.filter((i) => i.status === 'fail').length;
  const passCount = items.filter((i) => i.status === 'pass').length;
  const naCount = items.filter((i) => i.status === 'na').length;

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
                Reviewed
              </h4>
              <div className="text-sm text-muted-foreground">
                <p>
                  {inspection.reviewer_name ?? inspection.reviewed_by?.slice(0, 8) ?? 'Unknown'}
                  {' on '}
                  {formatDate(inspection.reviewed_at)}
                </p>
                {inspection.review_note && (
                  <p className="mt-1 bg-muted/50 rounded-md px-3 py-2">{inspection.review_note}</p>
                )}
              </div>
            </div>
          )}

          {isAdmin && !inspection.reviewed_at && (
            <div className="border-t pt-3 space-y-3">
              <h4 className="text-sm font-semibold">Admin Review</h4>
              <Textarea
                placeholder="Add review notes..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={onSubmitReview} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-1" />
                  )}
                  Mark Reviewed
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
