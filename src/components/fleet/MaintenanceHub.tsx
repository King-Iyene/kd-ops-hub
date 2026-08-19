import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Wrench,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Loader2,
  Search,
  Calendar,
  DollarSign,
  Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatDate } from '@/lib/format';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';

interface Props {
  vehicles: Array<{
    id: string;
    name: string;
    plate_number: string;
    total_mileage_km?: number;
  }>;
  onRefresh?: () => void;
}

interface MaintenanceItem {
  id: string;
  vehicle_id: string;
  service_type: string;
  due_date: string | null;
  due_mileage_km: number | null;
  recurrence: string;
  last_done_date: string | null;
  last_done_mileage_km: number | null;
  status: string;
  notes: string | null;
  cost_ngn: number | null;
  vendor: string | null;
  created_by: string | null;
  created_at: string;
}

type EffectiveStatus = 'overdue' | 'upcoming' | 'pending' | 'done';

const SERVICE_TYPES = [
  'Oil Change',
  'Tire Rotation',
  'Brake Service',
  'Engine Service',
  'AC Service',
  'Battery Check',
  'Suspension',
  'Transmission',
  'Electrical',
  'Body Work',
  'Custom',
] as const;

const RECURRENCE_OPTIONS = [
  { value: 'one_time', label: 'One Time' },
  { value: 'every_3_months', label: 'Every 3 Months' },
  { value: 'every_6_months', label: 'Every 6 Months' },
  { value: 'every_10000_km', label: 'Every 10,000 km' },
  { value: 'custom', label: 'Custom' },
] as const;

const STATUS_CONFIG: Record<EffectiveStatus, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-600 hover:bg-red-700 text-white' },
  upcoming: { label: 'Upcoming', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
  pending: { label: 'Pending', className: 'bg-blue-500 hover:bg-blue-600 text-white' },
  done: { label: 'Done', className: 'bg-green-600 hover:bg-green-700 text-white' },
};

function computeEffectiveStatus(
  item: MaintenanceItem,
  vehicleMileage?: number | null,
): EffectiveStatus {
  if (item.status === 'done') return 'done';

  // Check mileage-based overdue: if a mileage threshold is set and the
  // vehicle's current mileage exceeds it, the item is overdue regardless
  // of the calendar due date.
  if (
    item.due_mileage_km != null &&
    vehicleMileage != null &&
    vehicleMileage >= item.due_mileage_km
  ) {
    return 'overdue';
  }

  if (item.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(item.due_date + 'T00:00:00');
    if (due < today) return 'overdue';
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    if (due <= thirtyDaysOut) return 'upcoming';
  }
  return 'pending';
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays <= 7) return 'This Week';
  if (diffDays <= 14) return 'Next Week';
  if (diffDays <= 21) return 'In 2 Weeks';
  if (diffDays <= 28) return 'In 3 Weeks';
  return 'Later';
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const INITIAL_FORM = {
  vehicle_id: '',
  service_type: '',
  custom_service_type: '',
  recurrence: 'one_time',
  due_date: '',
  due_mileage_km: '',
  cost_ngn: '',
  vendor: '',
  notes: '',
};

export function MaintenanceHub({ vehicles, onRefresh }: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterVehicle, setFilterVehicle] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const [showMarkDoneDialog, setShowMarkDoneDialog] = useState(false);
  const [markDoneItem, setMarkDoneItem] = useState<MaintenanceItem | null>(null);
  const [markDoneCost, setMarkDoneCost] = useState('');
  const [markDoneVendor, setMarkDoneVendor] = useState('');
  const [markingDone, setMarkingDone] = useState(false);

  const [view, setView] = useState<'table' | 'calendar'>('table');

  const vehicleMap = useMemo(() => {
    const map = new Map<string, (typeof vehicles)[number]>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const fetchMaintenance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('vehicle_maintenance')
        .select('id, vehicle_id, service_type, due_date, due_mileage_km, recurrence, status, last_done_date, last_done_mileage_km, cost_ngn, vendor')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (fetchErr) throw fetchErr;
      setItems(data ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load maintenance data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaintenance();
  }, [fetchMaintenance]);

  const enrichedItems = useMemo(
    () =>
      items.map((item) => {
        const vehicle = vehicleMap.get(item.vehicle_id);
        return {
          ...item,
          effectiveStatus: computeEffectiveStatus(item, vehicle?.total_mileage_km),
          vehicle,
        };
      }),
    [items, vehicleMap],
  );

  const filteredItems = useMemo(() => {
    let result = enrichedItems;

    if (filterVehicle !== 'all') {
      result = result.filter((i) => i.vehicle_id === filterVehicle);
    }
    if (filterStatus !== 'all') {
      result = result.filter((i) => i.effectiveStatus === filterStatus);
    }
    if (filterServiceType !== 'all') {
      result = result.filter((i) => i.service_type === filterServiceType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.service_type.toLowerCase().includes(q) ||
          i.vendor?.toLowerCase().includes(q) ||
          i.vehicle?.name.toLowerCase().includes(q) ||
          i.vehicle?.plate_number.toLowerCase().includes(q),
      );
    }

    return result;
  }, [enrichedItems, filterVehicle, filterStatus, filterServiceType, searchQuery]);

  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let overdue = 0;
    let upcoming = 0;
    let completedThisMonth = 0;
    let mtdCost = 0;

    for (const item of enrichedItems) {
      if (item.effectiveStatus === 'overdue') overdue++;
      if (item.effectiveStatus === 'upcoming') upcoming++;
      if (item.status === 'done' && item.last_done_date) {
        const doneDate = new Date(item.last_done_date + 'T00:00:00');
        if (doneDate >= monthStart && doneDate <= now) {
          completedThisMonth++;
          if (item.cost_ngn) mtdCost += Number(item.cost_ngn);
        }
      }
    }

    return {
      total: enrichedItems.length,
      overdue,
      upcoming,
      completedThisMonth,
      mtdCost,
    };
  }, [enrichedItems]);

  const vehicleCosts = useMemo(() => {
    const costs = new Map<string, number>();
    for (const item of enrichedItems) {
      if (item.cost_ngn) {
        costs.set(item.vehicle_id, (costs.get(item.vehicle_id) ?? 0) + Number(item.cost_ngn));
      }
    }
    return costs;
  }, [enrichedItems]);

  const calendarGroups = useMemo(() => {
    const upcoming = enrichedItems
      .filter((i) => i.effectiveStatus !== 'done' && i.due_date)
      .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1));

    const groups = new Map<string, typeof upcoming>();
    for (const item of upcoming) {
      const week = getWeekLabel(item.due_date!);
      if (!groups.has(week)) groups.set(week, []);
      groups.get(week)!.push(item);
    }
    return groups;
  }, [enrichedItems]);

  const serviceTypes = useMemo(() => {
    const types = new Set<string>();
    for (const item of items) types.add(item.service_type);
    return Array.from(types).sort();
  }, [items]);

  const handleAddSubmit = async () => {
    if (!addForm.vehicle_id || (!addForm.service_type && !addForm.custom_service_type)) {
      toast({ title: 'Missing fields', description: 'Vehicle and service type are required.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const serviceType = addForm.service_type === 'Custom' ? addForm.custom_service_type : addForm.service_type;
      const { error: insertErr } = await supabase.from('vehicle_maintenance').insert({
        vehicle_id: addForm.vehicle_id,
        service_type: serviceType,
        recurrence: addForm.recurrence,
        due_date: addForm.due_date || null,
        due_mileage_km: addForm.due_mileage_km ? Number(addForm.due_mileage_km) : null,
        cost_ngn: addForm.cost_ngn ? Number(addForm.cost_ngn) : null,
        vendor: addForm.vendor || null,
        notes: addForm.notes || null,
        status: 'pending',
        created_by: profile?.id ?? null,
      });

      if (insertErr) throw insertErr;

      toast({ title: 'Work order created' });
      setShowAddDialog(false);
      setAddForm(INITIAL_FORM);
      await fetchMaintenance();
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create work order';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openMarkDone = (item: MaintenanceItem) => {
    setMarkDoneItem(item);
    setMarkDoneCost(item.cost_ngn ? String(item.cost_ngn) : '');
    setMarkDoneVendor(item.vendor ?? '');
    setShowMarkDoneDialog(true);
  };

  const handleMarkDone = async () => {
    if (!markDoneItem) return;
    setMarkingDone(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const vehicle = vehicleMap.get(markDoneItem.vehicle_id);
      const currentMileage = vehicle?.total_mileage_km ?? null;

      // Determine if this is a recurring item — recurring items stay
      // "pending" with an updated due date/mileage rather than being
      // permanently retired.
      const isRecurring =
        markDoneItem.recurrence !== 'one_time' && markDoneItem.recurrence !== 'custom';

      let nextDueDate: string | null = null;
      let nextDueMileage: number | null = null;
      if (markDoneItem.recurrence === 'every_3_months') nextDueDate = addMonths(today, 3);
      if (markDoneItem.recurrence === 'every_6_months') nextDueDate = addMonths(today, 6);
      if (markDoneItem.recurrence === 'every_10000_km') {
        nextDueMileage =
          (currentMileage ?? markDoneItem.last_done_mileage_km ?? 0) + 10_000;
      }

      const { error: updateErr } = await supabase
        .from('vehicle_maintenance')
        .update({
          status: isRecurring ? 'pending' : 'done',
          last_done_date: today,
          last_done_mileage_km: currentMileage ?? markDoneItem.last_done_mileage_km ?? null,
          due_date: isRecurring ? nextDueDate : markDoneItem.due_date,
          due_mileage_km: isRecurring ? nextDueMileage : markDoneItem.due_mileage_km,
          cost_ngn: markDoneCost ? Number(markDoneCost) : markDoneItem.cost_ngn,
          vendor: markDoneVendor || markDoneItem.vendor,
        })
        .eq('id', markDoneItem.id);

      if (updateErr) throw updateErr;

      toast({
        title: 'Marked as done' + (isRecurring ? ' — next due date set' : ''),
      });
      setShowMarkDoneDialog(false);
      setMarkDoneItem(null);
      await fetchMaintenance();
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setMarkingDone(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load maintenance data"
          description={error}
          tone="danger"
          action={
            <Button variant="outline" onClick={fetchMaintenance}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Wrench className="h-3.5 w-3.5" />
              Total Items
            </div>
            <p className="text-2xl font-bold">{loading ? '...' : stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Overdue
            </div>
            <p className="text-2xl font-bold text-red-600">{loading ? '...' : stats.overdue}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mb-1">
              <Clock className="h-3.5 w-3.5" />
              Upcoming (30d)
            </div>
            <p className="text-2xl font-bold text-amber-600">{loading ? '...' : stats.upcoming}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done (MTD)
            </div>
            <p className="text-2xl font-bold text-green-600">
              {loading ? '...' : stats.completedThisMonth}
            </p>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Cost (MTD)
            </div>
            <p className="text-xl font-bold currency">{loading ? '...' : formatNaira(stats.mtdCost)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>

          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[160px]">
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

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterServiceType} onValueChange={setFilterServiceType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Services" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {serviceTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(filterVehicle !== 'all' ||
            filterStatus !== 'all' ||
            filterServiceType !== 'all' ||
            searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterVehicle('all');
                setFilterStatus('all');
                setFilterServiceType('all');
                setSearchQuery('');
              }}
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setView('table')}
            >
              Table
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'calendar'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setView('calendar')}
            >
              Calendar
            </button>
          </div>

          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Work Order
          </Button>
        </div>
      </div>

      {view === 'table' && (
        <Card>
          <div className="overflow-x-auto">
            {loading ? (
              <TableSkeleton rows={8} cols={9} />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="No maintenance items"
                description={
                  enrichedItems.length > 0
                    ? 'No items match the current filters.'
                    : 'Create a work order to start tracking fleet maintenance.'
                }
                action={
                  enrichedItems.length === 0 ? (
                    <Button onClick={() => setShowAddDialog(true)} size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Work Order
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Due Mileage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Last Done</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const cfg = STATUS_CONFIG[item.effectiveStatus];
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {item.vehicle?.name ?? 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.vehicle?.plate_number ?? '---'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{item.service_type}</TableCell>
                        <TableCell className="text-sm">
                          {item.due_date ? formatDate(item.due_date) : '---'}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {item.due_mileage_km != null
                            ? `${item.due_mileage_km.toLocaleString()} km`
                            : '---'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cfg.className}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-right currency">
                          {item.cost_ngn != null ? formatNaira(Number(item.cost_ngn)) : '---'}
                        </TableCell>
                        <TableCell className="text-sm">{item.vendor ?? '---'}</TableCell>
                        <TableCell className="text-sm">
                          {item.last_done_date ? formatDate(item.last_done_date) : '---'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.effectiveStatus !== 'done' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openMarkDone(item)}
                            >
                              Mark Done
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </div>
        </Card>
      )}

      {view === 'calendar' && (
        <div className="space-y-4">
          {loading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : calendarGroups.size === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming maintenance"
              description="All maintenance items are either completed or have no due date."
            />
          ) : (
            Array.from(calendarGroups.entries()).map(([weekLabel, weekItems]) => (
              <Card key={weekLabel}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {weekLabel}
                    <Badge variant="secondary" className="ml-1">
                      {weekItems.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {weekItems.map((item) => {
                    const cfg = STATUS_CONFIG[item.effectiveStatus];
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge className={`${cfg.className} shrink-0`}>
                            {cfg.label}
                          </Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.service_type} — {item.vehicle?.name ?? 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.due_date ? formatDate(item.due_date) : ''}{' '}
                              {item.vehicle?.plate_number
                                ? `| ${item.vehicle.plate_number}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        {item.effectiveStatus !== 'done' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => openMarkDone(item)}
                          >
                            Mark Done
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {!loading && vehicles.length > 0 && vehicleCosts.size > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Maintenance Spend by Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vehicles
                .filter((v) => vehicleCosts.has(v.id))
                .sort((a, b) => (vehicleCosts.get(b.id) ?? 0) - (vehicleCosts.get(a.id) ?? 0))
                .map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.plate_number}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0 currency">
                      {formatNaira(vehicleCosts.get(v.id) ?? 0)}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select
                value={addForm.vehicle_id}
                onValueChange={(v) => setAddForm((f) => ({ ...f, vehicle_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.plate_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Select
                value={addForm.service_type}
                onValueChange={(v) => setAddForm((f) => ({ ...f, service_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {addForm.service_type === 'Custom' && (
              <div className="space-y-1.5">
                <Label>Custom Service Name</Label>
                <Input
                  value={addForm.custom_service_type}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, custom_service_type: e.target.value }))
                  }
                  placeholder="e.g. Windshield Replacement"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Recurrence</Label>
              <Select
                value={addForm.recurrence}
                onValueChange={(v) => setAddForm((f) => ({ ...f, recurrence: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={addForm.due_date}
                  onChange={(e) => setAddForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due Mileage (km)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={addForm.due_mileage_km}
                  onChange={(e) => setAddForm((f) => ({ ...f, due_mileage_km: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Estimated Cost (NGN)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={addForm.cost_ngn}
                  onChange={(e) => setAddForm((f) => ({ ...f, cost_ngn: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input
                  placeholder="e.g. AutoFix Lagos"
                  value={addForm.vendor}
                  onChange={(e) => setAddForm((f) => ({ ...f, vendor: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional details..."
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMarkDoneDialog} onOpenChange={setShowMarkDoneDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Done</DialogTitle>
          </DialogHeader>
          {markDoneItem && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {markDoneItem.service_type} for{' '}
                {vehicleMap.get(markDoneItem.vehicle_id)?.name ?? 'Unknown Vehicle'}
              </p>
              <div className="space-y-1.5">
                <Label>Actual Cost (NGN)</Label>
                <Input
                  type="number"
                  value={markDoneCost}
                  onChange={(e) => setMarkDoneCost(e.target.value)}
                  placeholder="Enter actual cost"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input
                  value={markDoneVendor}
                  onChange={(e) => setMarkDoneVendor(e.target.value)}
                  placeholder="Enter vendor name"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMarkDoneDialog(false)}
              disabled={markingDone}
            >
              Cancel
            </Button>
            <Button onClick={handleMarkDone} disabled={markingDone}>
              {markingDone && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
