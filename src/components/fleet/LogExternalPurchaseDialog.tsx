import { useState } from 'react';
import { Loader2, Fuel, Wrench, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { friendlyDbError, errorMessage } from '@/lib/db-errors';
import { logAudit } from '@/lib/audit';
import { validateFile } from '@/lib/file-validation';
import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/utils';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { OcrReceiptScanner, type OcrResult } from '@/components/OcrReceiptScanner';
import type { FieldStaff, VehicleSummary } from '@/lib/fleet-utils';

const EMPTY_FORM = {
  employee_id: '', vehicle_id: '', amount_ngn: '', station_or_vendor: '',
  purchase_date: new Date().toISOString().slice(0, 10), notes: '', litres_filled: '',
};

interface LogExternalPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  staff: FieldStaff[];
  vehicles: VehicleSummary[];
  profile: { id: string; full_name?: string; role?: string; email?: string } | null;
  onSuccess: () => void;
}

export function LogExternalPurchaseDialog({
  open, onClose, staff, vehicles, profile, onSuccess,
}: LogExternalPurchaseDialogProps) {
  const { toast } = useToast();
  const [type, setType] = useState<'fuel' | 'repair'>('fuel');
  const [form, setForm] = useState(EMPTY_FORM);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    onClose();
    setForm({ ...EMPTY_FORM, purchase_date: new Date().toISOString().slice(0, 10) });
    setReceiptFile(null);
    setType('fuel');
  };

  const handleSubmit = async () => {
    if (!form.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    if (!form.vehicle_id) {
      toast({ title: 'Select a vehicle', description: 'Every logged purchase must be tied to a vehicle.', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(form.amount_ngn) || 0;
    if (amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!receiptFile) {
      toast({ title: 'Attach a receipt', description: 'A receipt is required to log an external purchase.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const employeeName = staff.find((s) => s.id === form.employee_id)?.full_name
        || (form.employee_id === profile?.id ? profile?.full_name : null)
        || 'employee';
      const paidAt = new Date(`${form.purchase_date}T12:00:00`).toISOString();

      const compressed = await compressImage(receiptFile);
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${type === 'fuel' ? 'fuel-receipts' : `repairs/${profile?.id}`}/external-${crypto.randomUUID()}-${safeName}`;
      const { data: upData, error: upErr } = await supabase.storage.from('receipts').upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
      const receiptUrl = urlData.publicUrl;

      if (type === 'fuel') {
        const litresFilled = parseFloat(form.litres_filled) || 0;
        const { error } = await supabase.from('fuel_requests').insert({
          driver_id: form.employee_id,
          vehicle_id: form.vehicle_id || null,
          station_name: form.station_or_vendor || 'Unknown station',
          amount_ngn: amount,
          litres_filled: litresFilled || null,
          reason: `Logged externally — paid outside the platform.${form.notes ? ` ${form.notes}` : ''}`,
          status: 'payment_sent',
          payment_sent_at: paidAt,
          logged_externally: true,
          receipt_url: receiptUrl,
        });
        if (error) throw error;

        if (form.vehicle_id && litresFilled > 0) {
          const { data: newLevel, error: extFuelErr } = await supabase.rpc('adjust_vehicle_fuel_level', {
            p_vehicle_id: form.vehicle_id,
            p_delta_litres: litresFilled,
            p_last_refuel_at: paidAt,
          });
          if (extFuelErr) {
            toast({ title: 'Fuel level sync failed', description: extFuelErr.message, variant: 'destructive' });
          }
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: form.vehicle_id,
            event_type: 'fuel_added',
            amount_litres: litresFilled,
            resulting_level_litres: newLevel,
          });
        }
        await logAudit('fuel_logged_externally', `Fuel purchase logged as paid outside the platform for ${employeeName} (${formatNaira(amount)}), receipt attached`, profile);
      } else {
        const description = form.notes || 'Repair — paid outside the platform';
        const { error } = await supabase.rpc('log_external_repair_purchase', {
          p_employee_id: form.employee_id,
          p_amount_ngn: amount,
          p_purchase_date: form.purchase_date,
          p_description: description,
          p_vendor_name: form.station_or_vendor || null,
          p_vehicle_id: form.vehicle_id || null,
          p_receipt_url: receiptUrl,
        });
        if (error) throw error;
        await logAudit('repair_logged_externally', `Repair purchase logged as paid outside the platform for ${employeeName} (${formatNaira(amount)}), receipt attached`, profile);
      }

      toast({ title: 'Purchase logged', description: 'Receipt attached — this entry is fully recorded.' });
      handleClose();
      onSuccess();
    } catch (err: unknown) {
      toast({ title: 'Could not log purchase', description: friendlyDbError(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log External Purchase</DialogTitle>
          <DialogDescription>
            For a fuel or repair purchase that was already paid for outside KDOps — e.g. a receipt sent over
            WhatsApp — instead of a live request going through approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['fuel', 'repair'] as const).map((t) => (
                <button key={t} type="button"
                  className={cn('flex items-center justify-center gap-2 rounded-xl border p-2.5 text-sm kd-transition', type === t ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-primary/30 hover:text-foreground')}
                  onClick={() => setType(t)}
                >
                  {t === 'fuel' ? <Fuel className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                  {t === 'fuel' ? 'Fuel' : 'Repair'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Employee <span className="text-destructive">*</span></Label>
            <Select
              value={form.employee_id || undefined}
              onValueChange={(v) => {
                const suggestedVehicle = vehicles.find((vh) => vh.assigned_driver_id === v)?.id || '';
                setForm((f) => ({ ...f, employee_id: v, vehicle_id: f.vehicle_id || suggestedVehicle }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Vehicle <span className="text-destructive">*</span> <span className="text-muted-foreground font-normal text-xs">(auto-suggested from assignment)</span></Label>
            <Select value={form.vehicle_id || undefined} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (<SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount (₦) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" value={form.amount_ngn} onChange={(e) => setForm((f) => ({ ...f, amount_ngn: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Date paid</Label>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{type === 'fuel' ? 'Fuel station' : 'Vendor / Garage'} <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input
              value={form.station_or_vendor}
              onChange={(e) => setForm((f) => ({ ...f, station_or_vendor: e.target.value }))}
              placeholder={type === 'fuel' ? 'e.g. NNPC Station' : 'e.g. Mekunwen Auto Parts'}
            />
          </div>

          {type === 'fuel' && (
            <div className="space-y-1">
              <Label>Litres filled <span className="text-muted-foreground font-normal text-xs">(optional — updates the vehicle's fuel level)</span></Label>
              <Input type="number" min="0" step="0.1" value={form.litres_filled} onChange={(e) => setForm((f) => ({ ...f, litres_filled: e.target.value }))} placeholder="e.g. 40" />
            </div>
          )}

          <div className="space-y-1">
            <Label>{type === 'repair' ? 'What was done' : 'Notes'} <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={type === 'repair' ? 'e.g. Brake pad replacement' : 'Any additional context…'}
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <Label>Receipt <span className="text-destructive">*</span></Label>
            <OcrReceiptScanner
              extractLitres={type === 'fuel'}
              onExtracted={(result: OcrResult, file: File) => {
                setReceiptFile(file);
                setForm((f) => ({
                  ...f,
                  amount_ngn: f.amount_ngn || result.amount_ngn || f.amount_ngn,
                  station_or_vendor: f.station_or_vendor || result.description || f.station_or_vendor,
                  purchase_date: result.date || f.purchase_date,
                  litres_filled: type === 'fuel' ? (f.litres_filled || result.litres || f.litres_filled) : f.litres_filled,
                }));
              }}
            />
            {receiptFile && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground truncate">{receiptFile.name}</span>
                <span className="shrink-0">— {(receiptFile.size / 1024).toFixed(1)} KB</span>
                <button type="button" className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setReceiptFile(null)}>
                  Change
                </button>
              </div>
            )}
            {!receiptFile && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                  <span className="flex-1 border-t" /><span>or attach manually</span><span className="flex-1 border-t" />
                </div>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!validateFile(f, toast)) {
                      (e.target as HTMLInputElement).value = '';
                      return;
                    }
                    setReceiptFile(f);
                  }}
                />
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {staff.find((s) => s.id === form.employee_id)?.full_name || 'This employee'} won't be able to
            submit another {type} request while an outstanding receipt is open — logging this with the
            receipt attached now keeps that clear.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.employee_id || !form.vehicle_id || !form.amount_ngn || !receiptFile}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Upload className="mr-2 h-4 w-4" /> Log Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
