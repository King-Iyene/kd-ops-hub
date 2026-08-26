import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { AlertTriangle, Plus, Wrench, Upload, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type FuelRequest,
  type TripLog,
  type VehicleSummary,
  type ReceiptDebt,
  daysSinceIso,
  getReceiptDebt,
  displayFuelStatus,
} from '@/lib/fleet-utils';

// ---------------------------------------------------------------------------
// Types for open-repair records shown as receipt-debt banners
// ---------------------------------------------------------------------------

interface OpenRepair {
  id: string;
  description: string | null;
  amount_ngn: number;
  created_at: string;
  vehicle_id: string | null;
  service_type: string | null;
  maintenance_item_id: string | null;
  repair_odometer_km: number | null;
  vendor_name?: string | null;
  date?: string | null;
}

// ---------------------------------------------------------------------------
// MyRequestsTab
// ---------------------------------------------------------------------------

export interface MyRequestsTabProps {
  myFuelRequests: FuelRequest[];
  myTripLogs: TripLog[];
  vehicles: VehicleSummary[];
  profile: { id: string; full_name?: string } | null;
  /** Called when the user clicks "New Fuel Request". */
  onNewFuelRequest?: () => void;
  /** Called when the user clicks "Repair Request". */
  onNewRepairRequest?: () => void;
  /** Called when the user clicks "Log External Purchase" (admin only). */
  onLogExternalPurchase?: () => void;
  /** Called when the user clicks "Upload Receipt" on a payment_sent fuel request. */
  onUploadReceipt?: (request: FuelRequest) => void;
  /** Called when the user clicks "Attach Receipt" on an open repair. */
  onUploadRepairReceipt?: (repair: OpenRepair) => void;
}

export function MyRequestsTab({
  myFuelRequests,
  myTripLogs,
  vehicles,
  profile,
  onNewFuelRequest,
  onNewRepairRequest,
  onLogExternalPurchase,
  onUploadReceipt,
  onUploadRepairReceipt,
}: MyRequestsTabProps) {
  const { profile: authProfile } = useAuthStore();
  const isAdmin =
    authProfile?.role === 'admin' ||
    authProfile?.role === 'finance' ||
    authProfile?.role === 'super_admin' ||
    authProfile?.role === 'operations';

  // Receipt accountability — immediate, no grace period: any outstanding
  // unreceipted fuel payment or repair blocks the next request of that
  // kind until the receipt is uploaded.
  const [myReceiptDebt, setMyReceiptDebt] = useState<ReceiptDebt | null>(null);
  const [myOpenRepairs, setMyOpenRepairs] = useState<OpenRepair[]>([]);

  const refreshMyReceiptDebt = useCallback(async () => {
    if (!profile?.id) return;
    const [debt, { data: openRepairs }] = await Promise.all([
      getReceiptDebt(profile.id),
      supabase
        .from('expenses')
        .select('id, description, amount_ngn, created_at, vehicle_id, service_type, maintenance_item_id, repair_odometer_km, vendor_name, date')
        .eq('submitted_by', profile.id)
        .eq('category', 'repair')
        // Only company-charge repairs can legitimately be missing a
        // receipt post-approval — reimbursements over ₦10,000 require one
        // at submission, so they're never in this state. Matches
        // getReceiptDebt()'s filter.
        .eq('is_reimbursement', false)
        // Fleet-originated only — see the matching filter + comment in
        // getReceiptDebt() (fleet-utils.ts). A repair expense submitted
        // from the generic Expenses page has no vehicle_id and must not
        // show up here.
        .not('vehicle_id', 'is', null)
        .is('receipt_url', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ]);
    setMyReceiptDebt(debt);
    setMyOpenRepairs((openRepairs as any) || []);
  }, [profile?.id]);

  useEffect(() => {
    refreshMyReceiptDebt();
  }, [refreshMyReceiptDebt]);

  const fuelBlocked = (myReceiptDebt?.fuelCount ?? 0) > 0;
  const repairBlocked = (myReceiptDebt?.repairCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        {isAdmin && (
          <Button variant="outline" onClick={onLogExternalPurchase}>
            <Receipt className="mr-2 h-4 w-4" /> Log External Purchase
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={repairBlocked ? 'cursor-not-allowed' : undefined}>
              <Button variant="outline" disabled={repairBlocked} onClick={onNewRepairRequest}>
                <Wrench className="mr-2 h-4 w-4" /> Repair Request
              </Button>
            </span>
          </TooltipTrigger>
          {repairBlocked && <TooltipContent>Attach the receipt for your outstanding repair before requesting another.</TooltipContent>}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={fuelBlocked ? 'cursor-not-allowed' : undefined}>
              <Button disabled={fuelBlocked} onClick={onNewFuelRequest}>
                <Plus className="mr-2 h-4 w-4" /> New Fuel Request
              </Button>
            </span>
          </TooltipTrigger>
          {fuelBlocked && <TooltipContent>Upload the receipt for your outstanding fuel payment before requesting again.</TooltipContent>}
        </Tooltip>
      </div>

      {/* Red action banners for fuel requests still missing a receipt.
          Must mirror getReceiptDebt()'s own filter (status===payment_sent
          AND receipt_url is null) — a row logged via "Log External
          Purchase" is inserted as payment_sent with the receipt already
          attached (a DB constraint requires that status), so checking
          status alone re-flags rows that were never actually blocking
          anything. */}
      {myFuelRequests.filter((r) => r.status === 'payment_sent' && !r.receipt_url).map((r) => {
        const days = daysSinceIso(r.payment_sent_at);
        return (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-md border px-4 py-3 border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200"
          >
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Payment sent for {r.station_name} — {formatNaira(r.amount_ngn || 0)}</p>
              <p className="text-xs mt-0.5">
                {r.payment_sent_at ? `Sent on ${formatDate(r.payment_sent_at)}${days !== null ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''}. ` : ''}
                You cannot submit new fuel requests until this receipt is uploaded.
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 text-white bg-red-600 hover:bg-red-700"
              onClick={() => onUploadReceipt?.(r)}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Receipt
            </Button>
          </div>
        );
      })}

      {/* Banners for repairs still missing a receipt */}
      {myOpenRepairs.map((r) => {
        const days = daysSinceIso(r.created_at);
        return (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-md border px-4 py-3 border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200"
          >
            <Wrench className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Repair receipt needed — {r.description || 'Repair'} — {formatNaira(r.amount_ngn || 0)}</p>
              <p className="text-xs mt-0.5">
                Submitted {formatDate(r.created_at)}{days !== null ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''}. You cannot submit new repair requests until this receipt is uploaded.
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 text-white bg-red-600 hover:bg-red-700"
              onClick={() => onUploadRepairReceipt?.(r)}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Attach Receipt
            </Button>
          </div>
        );
      })}

      {/* Fuel requests table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Fuel Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Station</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {myFuelRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
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
                    <TableCell><StatusBadge status={displayFuelStatus(r)} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    <TableCell>
                      {r.status === 'payment_sent' && !r.receipt_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => onUploadReceipt?.(r)}
                        >
                          <Upload className="h-3 w-3 mr-1" /> Upload Receipt
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
