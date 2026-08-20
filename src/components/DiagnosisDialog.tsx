import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { providerLabel as providerLabelFor } from '@/lib/payments/item-facade';

export interface DiagnosisResult {
  itemId: string;
  ok: boolean;
  bankCode: string;
  account: string;
  bank: string;
  result: string;
  provider: 'paystack' | 'flutterwave';
}

interface DiagnosisDialogProps {
  diagnosis: DiagnosisResult | null;
  onClose: () => void;
}

export function DiagnosisDialog({ diagnosis, onClose }: DiagnosisDialogProps) {
  return (
    <Dialog open={!!diagnosis} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{diagnosis ? providerLabelFor(diagnosis.provider) : 'Provider'} resolve diagnostic</DialogTitle>
          <DialogDescription>
            Verbatim response from {diagnosis ? providerLabelFor(diagnosis.provider) : 'the provider'}'s <code className="text-xs">/bank/resolve</code> endpoint
            for the exact bank code and account number we send. Compare this with what the provider's own
            dashboard returns for the same details.
          </DialogDescription>
        </DialogHeader>
        {diagnosis && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <span className="text-muted-foreground">Bank:</span>
              <span className="font-mono">{diagnosis.bank}</span>
              <span className="text-muted-foreground">Bank code sent:</span>
              <span className="font-mono">{diagnosis.bankCode}</span>
              <span className="text-muted-foreground">Account sent:</span>
              <span className="font-mono">{diagnosis.account} <span className="text-muted-foreground">({diagnosis.account.length} digits)</span></span>
            </div>
            <div className={`rounded-md border p-3 ${diagnosis.ok ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20' : 'border-destructive/40 bg-destructive/5'}`}>
              <p className={`text-xs font-semibold mb-1 ${diagnosis.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                {diagnosis.ok ? `${providerLabelFor(diagnosis.provider)} RESOLVED the account ✓` : `${providerLabelFor(diagnosis.provider)} REJECTED the request ✗`}
              </p>
              <p className="font-mono text-xs break-all">{diagnosis.result}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {diagnosis.ok
                ? `If resolve works but the actual transfer fails, the issue is downstream (recipient/account cache, wallet balance, or ${providerLabelFor(diagnosis.provider)} rate limits).`
                : `Try the same bank code + account on ${providerLabelFor(diagnosis.provider)}'s own dashboard. If it succeeds there but fails here, the parameters we send differ — copy this raw error and share with engineering.`}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
