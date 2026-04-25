import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { notifyRoles } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { Loader2, Upload, Receipt, ChevronDown, ChevronUp } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  make_model: string | null;
  weekly_budget_ngn: number;
}

interface FuelRequest {
  id: string;
  amount_ngn: number;
  status: string;
  reason: string | null;
  created_at: string;
  vehicle_id: string | null;
  receipt_url: string | null;
}

// "Apr 21, 2026" — independent of locale fallback used elsewhere.
function formatLongDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function DriverDashboard() {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [requests, setRequests] = useState<FuelRequest[]>([]);
  const [weeklyBudget, setWeeklyBudget] = useState<{ total: number; used: number; remaining: number } | null>(null);

  // Inline receipt-upload state — keyed by request id so each card is independent.
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [litresFilled, setLitresFilled] = useState('');
  const [stationName, setStationName] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Fuel request form (Section 3)
  const [fuelAmount, setFuelAmount] = useState('');
  const [fuelNotes, setFuelNotes] = useState('');
  const [fuelDoc, setFuelDoc] = useState<File | null>(null);
  const [submittingFuel, setSubmittingFuel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fuelDocRef = useRef<HTMLInputElement>(null);

  // ---- Data loading ------------------------------------------------------
  const fetchData = async () => {
    if (!profile?.id) return;

    const { data: vehData } = await supabase
      .from('vehicles')
      .select('id, name, plate_number, make_model, weekly_budget_ngn')
      .eq('assigned_driver_id', profile.id)
      .maybeSingle();
    const veh = vehData as Vehicle | null;
    setVehicle(veh);

    if (!veh?.id) {
      setRequests([]);
      return;
    }

    const { data: reqData } = await supabase
      .from('fuel_requests')
      .select('id, amount_ngn, status, reason, created_at, vehicle_id, receipt_url')
      .eq('vehicle_id', veh.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setRequests((reqData as FuelRequest[]) || []);

    // Weekly budget: sum approved/post-approval requests since Monday 00:00 local
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const { data: spendData } = await supabase
      .from('fuel_requests')
      .select('amount_ngn')
      .eq('vehicle_id', veh.id)
      .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
      .gte('created_at', monday.toISOString());
    const used = (spendData || []).reduce((s: number, r: any) => s + (r.amount_ngn || 0), 0);
    const total = veh.weekly_budget_ngn ?? 0;
    setWeeklyBudget({ total, used, remaining: Math.max(0, total - used) });
  };

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ---- Receipt upload ----------------------------------------------------
  const resetReceiptForm = () => {
    setReceiptFile(null);
    setLitresFilled('');
    setStationName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleCard = (id: string) => {
    if (openCardId === id) {
      setOpenCardId(null);
      resetReceiptForm();
    } else {
      setOpenCardId(id);
      resetReceiptForm();
    }
  };

  const handleReceiptSubmit = async (req: FuelRequest) => {
    if (!receiptFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setSubmittingId(req.id);
    try {
      const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `fuel-receipts/${req.id}-${safeName}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, receiptFile, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);

      const updatePayload: Record<string, unknown> = {
        status: 'receipt_uploaded',
        receipt_url: urlData.publicUrl,
      };
      if (stationName.trim()) updatePayload.fuel_station_name = stationName.trim();
      const litresNum = parseFloat(litresFilled);
      if (Number.isFinite(litresNum) && litresNum > 0) updatePayload.litres_filled = litresNum;

      const { error } = await supabase
        .from('fuel_requests')
        .update(updatePayload)
        .eq('id', req.id);
      if (error) throw error;

      await logAudit(
        'fuel_receipt_uploaded' as any,
        `Receipt uploaded for fuel request (${formatNaira(req.amount_ngn)})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'fuel_receipt_uploaded',
        module: 'fleet',
        title: 'Fuel receipt uploaded',
        body: `${profile?.full_name || 'Driver'} uploaded a receipt for ${formatNaira(req.amount_ngn)}`,
      });

      toast({ title: 'Receipt submitted', description: 'Admin will review it shortly.' });
      setOpenCardId(null);
      resetReceiptForm();
      fetchData();
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
    setSubmittingId(null);
  };

  // ---- Fuel request submit (Section 3) -----------------------------------
  const handleFuelSubmit = async () => {
    const amount = parseFloat(fuelAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (weeklyBudget && amount > weeklyBudget.remaining) {
      toast({
        title: 'Amount exceeds remaining budget',
        description: `You have ${formatNaira(weeklyBudget.remaining)} remaining this week.`,
        variant: 'destructive',
      });
      return;
    }
    setSubmittingFuel(true);
    const { data: inserted, error } = await supabase
      .from('fuel_requests')
      .insert({
        driver_id: profile!.id,
        station_name: '',
        amount_ngn: amount,
        reason: fuelNotes.trim() || null,
        status: 'pending',
        vehicle_id: vehicle?.id || null,
      })
      .select('id')
      .single();
    if (error) {
      toast({ title: 'Error submitting request', description: error.message, variant: 'destructive' });
      setSubmittingFuel(false);
      return;
    }
    if (fuelDoc && inserted?.id) {
      try {
        const safeName = fuelDoc.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `fuel-request-docs/${inserted.id}-${safeName}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from('receipts')
          .upload(path, fuelDoc, { upsert: true });
        if (!upErr && upData) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
          await supabase.from('fuel_requests')
            .update({ request_doc_url: urlData.publicUrl })
            .eq('id', inserted.id);
        }
      } catch { /* best-effort — request is already saved */ }
    }
    await logAudit('fuel_request_submitted', `Fuel request: ${formatNaira(amount)}`, profile);
    await notifyRoles({
      roles: ['super_admin', 'admin', 'finance'],
      type: 'fuel_request_submitted',
      module: 'fleet',
      title: 'Fuel request submitted',
      body: `${formatNaira(amount)} from ${profile?.full_name || 'Driver'}`,
    });
    toast({ title: 'Fuel request submitted!', description: 'An admin will review it shortly.' });
    setFuelAmount('');
    setFuelNotes('');
    setFuelDoc(null);
    if (fuelDocRef.current) fuelDocRef.current.value = '';
    fetchData();
    setSubmittingFuel(false);
  };

  // ---- Render ------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#006994]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Sticky brand bar */}
      <header className="sticky top-0 z-50 bg-[#006994] text-white shadow-md">
        <div className="max-w-[430px] mx-auto px-4 py-3">
          <p className="font-bold text-base tracking-tight">KDOps Driver</p>
        </div>
      </header>

      <main className="max-w-[430px] mx-auto px-4 py-4 space-y-4 pb-10">
        {/* Section 1 (trip control) lands in a follow-up turn. */}

        {/* ─── SECTION 2 — WEEKLY FUEL BUDGET ────────────────────────── */}
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 py-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            This Week's Fuel Budget
          </h2>
          {!vehicle ? (
            <p className="text-sm text-gray-400">No vehicle assigned.</p>
          ) : weeklyBudget ? (
            <div className="space-y-2">
              {/* Progress bar */}
              {(() => {
                const remainingPct = weeklyBudget.total > 0
                  ? (weeklyBudget.remaining / weeklyBudget.total) * 100
                  : 0;
                const fillPct = weeklyBudget.total > 0
                  ? Math.min(100, (weeklyBudget.used / weeklyBudget.total) * 100)
                  : 0;
                const barColor = remainingPct > 50
                  ? 'bg-green-500'
                  : remainingPct >= 25
                  ? 'bg-amber-500'
                  : 'bg-red-500';
                const textColor = remainingPct > 50
                  ? 'text-green-700'
                  : remainingPct >= 25
                  ? 'text-amber-700'
                  : 'text-red-700';
                return (
                  <>
                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {formatNaira(weeklyBudget.used)} of {formatNaira(weeklyBudget.total)} used
                      </span>
                    </div>
                    <p className={`text-base font-semibold ${textColor}`}>
                      {formatNaira(weeklyBudget.remaining)} remaining
                    </p>
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Loading budget…</p>
          )}
        </section>

        {/* ─── SECTION 3 — FUEL REQUEST FORM ──────────────────────────── */}
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 py-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            New Fuel Request
          </h2>

          {/* Remaining budget hint */}
          {weeklyBudget && (
            <p className="text-sm text-amber-700 font-medium mb-4">
              You have {formatNaira(weeklyBudget.remaining)} remaining this week.
            </p>
          )}

          <div className="space-y-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Amount (₦) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={fuelAmount}
                onChange={(e) => setFuelAmount(e.target.value)}
                className="h-12 text-xl font-mono bg-white"
              />
              {weeklyBudget && fuelAmount && parseFloat(fuelAmount) > weeklyBudget.remaining && (
                <p className="text-xs text-red-600 pt-0.5">
                  Amount exceeds your remaining weekly budget of {formatNaira(weeklyBudget.remaining)}.
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <textarea
                rows={2}
                placeholder="Station name, reason…"
                value={fuelNotes}
                onChange={(e) => setFuelNotes(e.target.value)}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Photo / document */}
            <div>
              <input
                ref={fuelDocRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFuelDoc(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => fuelDocRef.current?.click()}
                className="w-full h-12 border-2 border-dashed border-gray-200 hover:border-[#006994] rounded-xl text-sm text-gray-500 hover:text-[#006994] flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {fuelDoc ? fuelDoc.name : 'Attach photo or document (optional)'}
                </span>
              </button>
            </div>

            {/* Submit */}
            <Button
              className="w-full h-14 text-base font-semibold bg-[#006994] hover:bg-[#005577] text-white rounded-xl"
              onClick={handleFuelSubmit}
              disabled={
                submittingFuel
                || !fuelAmount
                || parseFloat(fuelAmount) <= 0
                || !!(weeklyBudget && parseFloat(fuelAmount) > weeklyBudget.remaining)
              }
            >
              {submittingFuel && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
              Submit Fuel Request
            </Button>
          </div>
        </section>

        {/* ─── SECTION 4 — MY RECENT REQUESTS ────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              My Recent Requests
            </h2>
            {vehicle && (
              <span className="text-[11px] text-gray-400">
                {vehicle.plate_number}
              </span>
            )}
          </div>

          {!vehicle ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              No vehicle assigned. Contact your fleet manager to see fuel requests.
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-6 text-sm text-gray-400 text-center">
              No fuel requests yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {requests.map((req) => {
                const isOpen = openCardId === req.id;
                const needsReceipt = req.status === 'payment_sent';
                const isSubmitting = submittingId === req.id;
                return (
                  <li
                    key={req.id}
                    className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
                  >
                    {/* Card header — always visible */}
                    <div className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500">
                          {formatLongDate(req.created_at)}
                        </p>
                        <p className="font-semibold text-base text-gray-900 mt-0.5">
                          {formatNaira(req.amount_ngn)}
                        </p>
                        {req.reason && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {req.reason}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <StatusBadge status={req.status} />
                      </div>
                    </div>

                    {/* Receipt section — payment_sent only */}
                    {needsReceipt && (
                      <div className="px-4 pb-4 -mt-1">
                        {!isOpen ? (
                          <button
                            type="button"
                            onClick={() => toggleCard(req.id)}
                            className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-semibold text-sm rounded-xl h-11 inline-flex items-center justify-center gap-2 transition-colors"
                          >
                            <Receipt className="h-4 w-4" />
                            Upload Receipt
                          </button>
                        ) : (
                          <div className="space-y-3 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between pt-2">
                              <p className="text-sm font-semibold text-gray-700">
                                Upload fuel receipt
                              </p>
                              <button
                                type="button"
                                onClick={() => toggleCard(req.id)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-gray-600">
                                Receipt file <span className="text-red-500">*</span>
                              </Label>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) =>
                                  setReceiptFile(e.target.files?.[0] || null)
                                }
                              />
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full border-2 border-dashed border-gray-200 hover:border-[#006994] rounded-xl py-3 px-3 text-sm text-gray-500 hover:text-[#006994] flex items-center justify-center gap-2 transition-colors"
                              >
                                <Upload className="h-4 w-4" />
                                {receiptFile ? receiptFile.name : 'Choose photo or PDF'}
                              </button>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-gray-600">
                                Litres filled
                              </Label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                placeholder="e.g. 35.5"
                                value={litresFilled}
                                onChange={(e) => setLitresFilled(e.target.value)}
                                className="h-11 text-base bg-white"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-gray-600">
                                Fuel station name
                              </Label>
                              <Input
                                type="text"
                                placeholder="e.g. Total Lekki"
                                value={stationName}
                                onChange={(e) => setStationName(e.target.value)}
                                className="h-11 text-base bg-white"
                              />
                            </div>

                            <Button
                              className="w-full h-11 bg-[#006994] hover:bg-[#005577] text-white font-semibold rounded-xl"
                              onClick={() => handleReceiptSubmit(req)}
                              disabled={!receiptFile || isSubmitting}
                            >
                              {isSubmitting && (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              )}
                              Submit Receipt
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Receipt link if already uploaded */}
                    {!needsReceipt && req.receipt_url && (
                      <div className="px-4 pb-3">
                        <button
                          type="button"
                          onClick={() => setOpenCardId(isOpen ? null : req.id)}
                          className="text-xs text-[#006994] hover:underline inline-flex items-center gap-1"
                        >
                          {isOpen ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Hide receipt
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> View receipt
                            </>
                          )}
                        </button>
                        {isOpen && (
                          <a
                            href={req.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-sm text-[#006994] underline break-all"
                          >
                            {req.receipt_url}
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
