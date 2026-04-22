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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Loader2, Check, X, Fuel, MapPin, Plus, Car, Pencil, Trash2, Info, CreditCard, History, User, AlertTriangle, Wrench } from 'lucide-react';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { getBankCode, createTransferRecipient, initiateTransfer } from '@/lib/paystack';

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
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
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

  const [tab, setTab] = useState<'fuel' | 'trips' | 'vehicles' | 'my_requests' | 'activity'>('fuel');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

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

  const EMPTY_FUEL_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [fuelBankDetails, setFuelBankDetails] = useState<BankAccountValue>(EMPTY_FUEL_BANK);
  const [showFuelBankSection, setShowFuelBankSection] = useState(false);

  // Phase 1 — vehicle & weekly budget state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelVehicleId, setFuelVehicleId] = useState('');
  const [weekBudget, setWeekBudget] = useState<{ spent: number; total: number } | null>(null);

  // Phase 4 — repair request form
  const EMPTY_REPAIR_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [repairForm, setRepairForm] = useState({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '' });
  const [repairBank, setRepairBank] = useState<BankAccountValue>(EMPTY_REPAIR_BANK);
  const [repairReceipt, setRepairReceipt] = useState<File | null>(null);

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
    const [staffRes, profilesRes, fuelRes, tripRes, activityRes, vehicleRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'field_staff')
        .eq('status', 'active')
        .order('full_name'),
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
      supabase
        .from('audit_logs')
        .select('*')
        .or('action.ilike.%fuel%,action.ilike.%trip%,action.ilike.%fleet%,action.ilike.%vehicle%')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('vehicles')
        .select('id, name, plate_number, weekly_budget_ngn, assigned_driver_id, insurance_expiry, road_worthiness_expiry, next_service_date')
        .eq('status', 'active')
        .order('name'),
    ]);

    const fieldStaff = (staffRes.data as FieldStaff[]) || [];
    setStaff(fieldStaff);

    const lookup = ((profilesRes.data as FieldStaff[]) || []).concat(fieldStaff);
    setFuelRequests(enrich(fuelRes.data || [], lookup));
    setTripLogs(enrich(tripRes.data || [], lookup));
    setActivityLogs(activityRes.data || []);
    setVehicles((vehicleRes.data as Vehicle[]) || []);
    setLoading(false);
  };

  // Phase 1 — fetch current-week spend for a vehicle against its weekly budget
  const fetchWeekBudget = async (vehicleId: string) => {
    if (!vehicleId) { setWeekBudget(null); return; }
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || !v.weekly_budget_ngn) { setWeekBudget(null); return; }
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('fuel_requests')
      .select('amount_ngn')
      .eq('vehicle_id', vehicleId)
      .in('status', ['pending', 'approved'])
      .gte('created_at', monday.toISOString());
    const spent = (data || []).reduce((s: number, r: any) => s + (r.amount_ngn || 0), 0);
    setWeekBudget({ spent, total: v.weekly_budget_ngn });
  };

  // Phase 4 — pre-fill odometer_start from the driver's last trip end reading
  const prefillOdometer = async (driverId: string) => {
    if (!driverId) return;
    const { data } = await supabase
      .from('trip_logs')
      .select('odometer_end')
      .eq('driver_id', driverId)
      .not('odometer_end', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data?.[0]?.odometer_end) {
      setTripForm((f) => ({ ...f, odometer_start: String(data[0].odometer_end) }));
    }
  };

  // Phase 4 — submit repair reimbursement (creates expense with category='repair')
  const submitRepairRequest = async () => {
    if (!repairForm.employee_id || !repairForm.description || !repairForm.amount_ngn) {
      toast({ title: 'Employee, description and amount are required', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(repairForm.amount_ngn) || 0;
    if (amount > 10000 && !repairReceipt) {
      toast({ title: 'A receipt is required for repairs over ₦10,000', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      let receiptUrl: string | null = null;
      if (repairReceipt) {
        const ext = repairReceipt.name.split('.').pop();
        const path = `repairs/${profile?.id}/${Date.now()}.${ext}`;
        const { data: upData } = await supabase.storage
          .from('receipts')
          .upload(path, repairReceipt, { upsert: true });
        if (upData) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
          receiptUrl = urlData.publicUrl;
        }
      }
      await supabase.from('expenses').insert({
        submitted_by: repairForm.employee_id,
        category: 'repair',
        budget_category: 'repair',
        amount_ngn: amount,
        date: new Date().toISOString().slice(0, 10),
        description: repairForm.description,
        status: 'pending',
        receipt_url: receiptUrl,
        ...(repairBank.verified ? {
          bank_name: repairBank.bank_name,
          account_number: repairBank.account_number,
          account_name: repairBank.account_name,
        } : {}),
      });
      await logAudit('repair_request_submitted', `Repair: ${repairForm.description} (${formatNaira(amount)})`, profile);
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'repair_request_submitted',
        module: 'fleet',
        title: 'Repair reimbursement submitted',
        body: `${formatNaira(amount)}: ${repairForm.description}`,
      });
      toast({ title: 'Repair request submitted' });
      setShowRepairForm(false);
      setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '' });
      setRepairBank(EMPTY_REPAIR_BANK);
      setRepairReceipt(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSubmitting(false);
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
      vehicle_id: fuelVehicleId || null,
      ...(fuelBankDetails.verified ? {
        bank_name: fuelBankDetails.bank_name,
        account_number: fuelBankDetails.account_number,
        account_name: fuelBankDetails.account_name,
      } : {}),
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
      setShowFuelBankSection(false);
      setFuelBankDetails(EMPTY_FUEL_BANK);
      setFuelVehicleId('');
      setWeekBudget(null);
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
  const [confirmDeleteFuel, setConfirmDeleteFuel] = useState<FuelRequest | null>(null);
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState<TripLog | null>(null);

  // Trip log detail / edit
  const canEditTrip = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [selectedTrip, setSelectedTrip] = useState<TripLog | null>(null);
  const [tripEditMode, setTripEditMode] = useState(false);
  const [savingTripEdit, setSavingTripEdit] = useState(false);
  const [tripEditForm, setTripEditForm] = useState({
    date: '',
    start_location: '',
    end_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_amount_ngn: '',
    litres: '',
    issues: '',
  });

  const openTripDetail = (t: TripLog) => {
    setSelectedTrip(t);
    setTripEditMode(false);
    setTripEditForm({
      date: t.date,
      start_location: t.start_location,
      end_location: t.end_location,
      odometer_start: t.odometer_start != null ? String(t.odometer_start) : '',
      odometer_end: t.odometer_end != null ? String(t.odometer_end) : '',
      fuel_amount_ngn: t.fuel_amount_ngn != null ? String(t.fuel_amount_ngn) : '',
      litres: t.litres != null ? String(t.litres) : '',
      issues: t.issues || '',
    });
  };

  const saveTripEdit = async () => {
    if (!selectedTrip) return;
    const start = parseFloat(tripEditForm.odometer_start);
    const end = parseFloat(tripEditForm.odometer_end);
    const hasOdo = Number.isFinite(start) && Number.isFinite(end) && tripEditForm.odometer_start && tripEditForm.odometer_end;
    const km = hasOdo ? end - start : selectedTrip.km_driven;
    setSavingTripEdit(true);
    const { error } = await supabase
      .from('trip_logs')
      .update({
        date: tripEditForm.date,
        start_location: tripEditForm.start_location,
        end_location: tripEditForm.end_location,
        odometer_start: Number.isFinite(start) ? start : null,
        odometer_end: Number.isFinite(end) ? end : null,
        km_driven: km,
        fuel_amount_ngn: parseFloat(tripEditForm.fuel_amount_ngn) || null,
        litres: parseFloat(tripEditForm.litres) || null,
        issues: tripEditForm.issues || null,
      })
      .eq('id', selectedTrip.id);
    setSavingTripEdit(false);
    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Trip log updated' });
      setSelectedTrip(null);
      setTripEditMode(false);
      await fetchData();
    }
  };

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
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'approved' })
      .eq('id', request.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('expenses').insert({
      category: 'fuel',
      budget_category: 'fuel',
      amount_ngn: request.amount_ngn,
      date: now.slice(0, 10),
      description: `Fuel — ${request.station_name || 'Station'} — ${request.reason || 'Fuel request'}`,
      submitted_by: (request as any).driver_id || request.employee_id,
      status: 'approved',
      approved_by: profile?.id,
      approved_at: now,
      ...(request.bank_name ? {
        bank_name: request.bank_name,
        account_number: request.account_number,
        account_name: request.account_name,
      } : {}),
    });
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

    // Phase 2 — auto-pay via Paystack if the driver provided bank details
    if (request.bank_name && request.account_number && request.account_name) {
      try {
        const { data: batch } = await supabase.from('payment_batches').insert({
          name: `Fuel Reimbursement — ${request.account_name}`,
          payment_date: now.slice(0, 10),
          total_amount: request.amount_ngn,
          beneficiary_count: 1,
          status: 'approved',
          is_quick_pay: true,
          payment_category: 'fuel_reimbursement',
          batch_type: 'contractor',
          created_by: profile?.id,
        }).select().single();
        if (batch) {
          const { data: batchItem } = await supabase.from('batch_items').insert({
            batch_id: batch.id,
            full_name: request.account_name,
            bank_name: request.bank_name,
            account_number: request.account_number,
            amount_ngn: request.amount_ngn,
            item_type: 'adhoc',
            status: 'pending',
          }).select().single();
          await supabase.from('fuel_requests').update({ batch_id: batch.id }).eq('id', request.id);
          const bankCode = await getBankCode(request.bank_name);
          const recipient = await createTransferRecipient({
            name: request.account_name,
            account_number: request.account_number,
            bank_code: bankCode,
          });
          await initiateTransfer({
            recipient_code: recipient.recipient_code,
            amount_ngn: request.amount_ngn,
            reference: batch.id,
            reason: `Fuel reimbursement — ${request.station_name}`,
          });
          if (batchItem) {
            await supabase.from('batch_items')
              .update({ paystack_recipient_code: recipient.recipient_code })
              .eq('id', batchItem.id);
          }
          toast({ title: 'Approved & payment initiated automatically' });
        }
      } catch (autoPayErr) {
        console.warn('[Fleet] auto-pay failed:', autoPayErr);
        toast({ title: 'Approved. Bank transfer failed — process manually via Expenses.' });
      }
    } else {
      toast({ title: 'Fuel request approved' });
    }
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

  const deleteFuelRequest = async (r: FuelRequest) => {
    const { error } = await supabase.from('fuel_requests').delete().eq('id', r.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fuel_request_deleted', `Fuel request for ${r.employee_name} deleted (${formatNaira(r.amount_ngn || 0)})`, profile);
    toast({ title: 'Fuel request deleted' });
    setConfirmDeleteFuel(null);
    fetchData();
  };

  const deleteTripLog = async (t: TripLog) => {
    const { error } = await supabase.from('trip_logs').delete().eq('id', t.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('trip_log_deleted', `Trip log deleted: ${t.start_location} → ${t.end_location}`, profile);
    toast({ title: 'Trip log deleted' });
    setConfirmDeleteTrip(null);
    fetchData();
  };

  if (loading) return <TableSkeleton rows={5} />;

  // Phase 4 — service alerts (vehicles with expiries within 30 days)
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30Str = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const serviceAlerts = isAdmin
    ? vehicles.filter(
        (v) =>
          (v.insurance_expiry && v.insurance_expiry <= in30Str) ||
          (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str) ||
          (v.next_service_date && v.next_service_date <= in30Str),
      )
    : [];

  const myFuelRequests = fuelRequests.filter((r) => r.employee_id === profile?.id);
  const myTripLogs = tripLogs.filter((r) => r.employee_id === profile?.id);

  const visibleFuel = isAdmin ? fuelRequests : myFuelRequests;
  const visibleTrips = isAdmin ? tripLogs : myTripLogs;

  const fleetAvgEfficiency = (() => {
    let totalKm = 0;
    let totalLitres = 0;
    for (const t of visibleTrips) {
      if (t.km_driven && t.litres && t.km_driven > 0 && t.litres > 0) {
        totalKm += t.km_driven;
        totalLitres += t.litres;
      }
    }
    return totalLitres > 0 ? (totalKm / totalLitres).toFixed(1) : null;
  })();

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

      {/* Phase 4 — service / compliance alerts */}
      {serviceAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {serviceAlerts.map((v) => {
            const msgs: string[] = [];
            if (v.insurance_expiry && v.insurance_expiry <= in30Str)
              msgs.push(`insurance expires ${formatDate(v.insurance_expiry)}${v.insurance_expiry <= todayStr ? ' (EXPIRED)' : ''}`);
            if (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str)
              msgs.push(`roadworthy expires ${formatDate(v.road_worthiness_expiry)}${v.road_worthiness_expiry <= todayStr ? ' (EXPIRED)' : ''}`);
            if (v.next_service_date && v.next_service_date <= in30Str)
              msgs.push(`service due ${formatDate(v.next_service_date)}`);
            return (
              <div key={v.id} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>{v.name}</strong> ({(v as any).plate_number}): {msgs.join(' · ')}</span>
              </div>
            );
          })}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="fuel">
            <Fuel className="mr-2 h-4 w-4" /> Fuel Requests
          </TabsTrigger>
          <TabsTrigger value="my_requests">
            <User className="mr-2 h-4 w-4" /> My Requests
          </TabsTrigger>
          <TabsTrigger value="trips">
            <MapPin className="mr-2 h-4 w-4" /> Trip Logs
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="vehicles">
              <Car className="mr-2 h-4 w-4" /> Vehicles
            </TabsTrigger>
          )}
          <TabsTrigger value="activity">
            <History className="mr-2 h-4 w-4" /> Activity
          </TabsTrigger>
        </TabsList>

        {/* FUEL */}
        <TabsContent value="fuel" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRepairForm(true)}>
              <Wrench className="mr-2 h-4 w-4" /> Repair Request
            </Button>
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
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteFuel(r)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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
            <Button onClick={() => { setShowTripForm(true); prefillOdometer(profile?.id || ''); }}>
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
                    <TableHead className="text-right">Odometer</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Fuel (₦)</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead className="text-right">km/L</TableHead>
                    <TableHead>Issues</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTrips.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdmin ? 10 : 9}
                        className="text-center text-muted-foreground text-sm py-8"
                      >
                        No trip logs yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleTrips.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openTripDetail(t)}
                    >
                      <TableCell className="font-medium">{t.employee_name}</TableCell>
                      <TableCell>{formatDate(t.date)}</TableCell>
                      <TableCell className="text-sm">
                        {t.start_location} → {t.end_location}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {t.odometer_start != null ? t.odometer_start.toLocaleString() : '—'}
                        {' → '}
                        {t.odometer_end != null ? t.odometer_end.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.km_driven != null ? t.km_driven.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right currency">
                        {t.fuel_amount_ngn ? formatNaira(t.fuel_amount_ngn) : '—'}
                      </TableCell>
                      <TableCell className="text-right">{t.litres ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {t.km_driven && t.litres && t.km_driven > 0 && t.litres > 0
                          ? (t.km_driven / t.litres).toFixed(1)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {t.issues || '—'}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteTrip(t)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {fleetAvgEfficiency && visibleTrips.length > 0 && (
                <div className="px-4 py-2 border-t text-sm text-muted-foreground flex justify-end gap-2">
                  <span>Fleet average fuel efficiency:</span>
                  <span className="font-semibold text-foreground">{fleetAvgEfficiency} km/L</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MY REQUESTS */}
        <TabsContent value="my_requests" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRepairForm(true)}>
              <Wrench className="mr-2 h-4 w-4" /> Repair Request
            </Button>
            <Button onClick={() => setShowFuelForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Fuel Request
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Fuel Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myFuelRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                        You have no fuel requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {myFuelRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.station_name}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(r.amount_ngn || 0)}</TableCell>
                      <TableCell className="text-right">{r.litres_est ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.reason || '—'}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fleet Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                        No fleet activity recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {activityLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium capitalize">
                        {(log.action || '').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                        {log.description || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.actor_name || log.actor_id?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.created_at ? formatDate(log.created_at) : '—'}
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
      <Dialog open={showFuelForm} onOpenChange={(v) => { setShowFuelForm(v); if (!v) { setShowFuelBankSection(false); setFuelBankDetails(EMPTY_FUEL_BANK); setFuelVehicleId(''); setWeekBudget(null); } }}>
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
            {/* Phase 1 — vehicle selector + weekly budget bar */}
            {vehicles.length > 0 && (
              <div className="space-y-1">
                <Label>Vehicle <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select
                  value={fuelVehicleId}
                  onValueChange={(v) => { setFuelVehicleId(v); fetchWeekBudget(v); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} — {(v as any).plate_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {weekBudget && weekBudget.total > 0 && (() => {
                  const pct = Math.min(100, Math.round((weekBudget.spent / weekBudget.total) * 100));
                  const over = weekBudget.spent >= weekBudget.total;
                  const warn = pct >= 80 && !over;
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>This week's budget used</span>
                        <span className={over ? 'text-destructive font-semibold' : warn ? 'text-amber-600 font-semibold' : ''}>
                          {formatNaira(weekBudget.spent)} / {formatNaira(weekBudget.total)} ({pct}%)
                        </span>
                      </div>
                      <Progress value={pct} className={`h-1.5 ${over ? '[&>div]:bg-destructive' : warn ? '[&>div]:bg-amber-500' : ''}`} />
                      {over && <p className="text-xs text-destructive">Weekly budget exceeded. Admin will review before approving.</p>}
                      {warn && <p className="text-xs text-amber-600">Approaching weekly budget limit.</p>}
                    </div>
                  );
                })()}
              </div>
            )}
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
            <div className="pt-2 border-t">
              {!showFuelBankSection ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                  onClick={() => setShowFuelBankSection(true)}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Add bank account for reimbursement (optional)
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Bank account for reimbursement{' '}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { setShowFuelBankSection(false); setFuelBankDetails(EMPTY_FUEL_BANK); }}
                    >
                      Remove
                    </button>
                  </div>
                  <BankAccountField value={fuelBankDetails} onChange={setFuelBankDetails} />
                </div>
              )}
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

      <Dialog open={!!confirmDeleteFuel} onOpenChange={(v) => { if (!v) setConfirmDeleteFuel(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete fuel request</DialogTitle>
            <DialogDescription>
              Delete this fuel request from {confirmDeleteFuel?.employee_name}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteFuel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteFuel && deleteFuelRequest(confirmDeleteFuel)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteTrip} onOpenChange={(v) => { if (!v) setConfirmDeleteTrip(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trip log</DialogTitle>
            <DialogDescription>
              Delete this trip log ({confirmDeleteTrip?.start_location} → {confirmDeleteTrip?.end_location})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteTrip(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteTrip && deleteTripLog(confirmDeleteTrip)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip log detail / edit dialog */}
      <Dialog
        open={!!selectedTrip}
        onOpenChange={(v) => {
          if (!v) { setSelectedTrip(null); setTripEditMode(false); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Trip Log — {selectedTrip && formatDate(selectedTrip.date)}
            </DialogTitle>
            <DialogDescription>{selectedTrip?.employee_name}</DialogDescription>
          </DialogHeader>

          {selectedTrip && !tripEditMode && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">From</p>
                  <p className="font-medium">{selectedTrip.start_location || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">To</p>
                  <p className="font-medium">{selectedTrip.end_location || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 border rounded-lg p-3 bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Odometer Start</p>
                  <p className="font-semibold tabular-nums">{selectedTrip.odometer_start != null ? selectedTrip.odometer_start.toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Odometer End</p>
                  <p className="font-semibold tabular-nums">{selectedTrip.odometer_end != null ? selectedTrip.odometer_end.toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Distance (km)</p>
                  <p className="font-semibold tabular-nums text-primary">{selectedTrip.km_driven != null ? selectedTrip.km_driven.toLocaleString() : '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Fuel (₦)</p>
                  <p className="font-medium">{selectedTrip.fuel_amount_ngn ? formatNaira(selectedTrip.fuel_amount_ngn) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Litres</p>
                  <p className="font-medium">{selectedTrip.litres ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">km/L</p>
                  <p className="font-medium">
                    {selectedTrip.km_driven && selectedTrip.litres && selectedTrip.km_driven > 0 && selectedTrip.litres > 0
                      ? (selectedTrip.km_driven / selectedTrip.litres).toFixed(1)
                      : '—'}
                  </p>
                </div>
              </div>
              {selectedTrip.issues && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Issues Reported</p>
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{selectedTrip.issues}</p>
                </div>
              )}
            </div>
          )}

          {selectedTrip && tripEditMode && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={tripEditForm.date} onChange={(e) => setTripEditForm({ ...tripEditForm, date: e.target.value })} />
                </div>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input value={tripEditForm.start_location} onChange={(e) => setTripEditForm({ ...tripEditForm, start_location: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input value={tripEditForm.end_location} onChange={(e) => setTripEditForm({ ...tripEditForm, end_location: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Odometer Start</Label>
                  <Input type="number" value={tripEditForm.odometer_start} onChange={(e) => setTripEditForm({ ...tripEditForm, odometer_start: e.target.value })} placeholder="e.g. 42500" />
                </div>
                <div className="space-y-1">
                  <Label>Odometer End</Label>
                  <Input type="number" value={tripEditForm.odometer_end} onChange={(e) => setTripEditForm({ ...tripEditForm, odometer_end: e.target.value })} placeholder="e.g. 42750" />
                </div>
              </div>
              {tripEditForm.odometer_start && tripEditForm.odometer_end && (
                <p className="text-xs text-muted-foreground">
                  Distance: <strong>{(parseFloat(tripEditForm.odometer_end) - parseFloat(tripEditForm.odometer_start)).toLocaleString()} km</strong>
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fuel Purchased (₦)</Label>
                  <Input type="number" value={tripEditForm.fuel_amount_ngn} onChange={(e) => setTripEditForm({ ...tripEditForm, fuel_amount_ngn: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label>Litres</Label>
                  <Input type="number" value={tripEditForm.litres} onChange={(e) => setTripEditForm({ ...tripEditForm, litres: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Issues to Report</Label>
                <Textarea value={tripEditForm.issues} onChange={(e) => setTripEditForm({ ...tripEditForm, issues: e.target.value })} rows={2} placeholder="Optional" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!tripEditMode && (
              <>
                <Button variant="outline" onClick={() => setSelectedTrip(null)}>Close</Button>
                {canEditTrip && (
                  <Button variant="outline" onClick={() => setTripEditMode(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </>
            )}
            {tripEditMode && (
              <>
                <Button variant="outline" onClick={() => setTripEditMode(false)}>Cancel</Button>
                <Button onClick={saveTripEdit} disabled={savingTripEdit}>
                  {savingTripEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 4 — Repair request dialog */}
      <Dialog open={showRepairForm} onOpenChange={(v) => { setShowRepairForm(v); if (!v) { setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '' }); setRepairBank(EMPTY_REPAIR_BANK); setRepairReceipt(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vehicle Repair Reimbursement</DialogTitle>
            <DialogDescription>
              Submit a repair or maintenance cost for reimbursement. Receipts are required for amounts over ₦10,000.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={repairForm.employee_id}
                onValueChange={(v) => setRepairForm({ ...repairForm, employee_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                  ))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>{profile.full_name || profile.email} (me)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description of Repair</Label>
              <Textarea
                value={repairForm.description}
                onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                placeholder="e.g. Replaced front tyre — Toyota Camry ABC-123-XY"
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                value={repairForm.amount_ngn}
                onChange={(e) => setRepairForm({ ...repairForm, amount_ngn: e.target.value })}
              />
              {parseFloat(repairForm.amount_ngn) > 10000 && !repairReceipt && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Receipt required for amounts over ₦10,000
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Receipt {parseFloat(repairForm.amount_ngn) > 10000 ? <span className="text-destructive">*</span> : <span className="text-muted-foreground text-xs">(optional)</span>}
              </Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setRepairReceipt(e.target.files?.[0] || null)}
              />
              {repairReceipt && <p className="text-xs text-muted-foreground">{repairReceipt.name}</p>}
            </div>
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Bank account for reimbursement <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
              <BankAccountField value={repairBank} onChange={setRepairBank} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRepairForm(false)}>Cancel</Button>
            <Button
              onClick={submitRepairRequest}
              disabled={
                submitting ||
                !repairForm.employee_id ||
                !repairForm.description ||
                !repairForm.amount_ngn
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit Repair
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
