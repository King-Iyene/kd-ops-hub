import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/db-errors';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStepUpRequest, submitStepUp, cancelStepUp } from '@/hooks/use-step-up';

const PURPOSE_LABEL: Record<string, string> = {
  approve_batch: 'approve this payment batch',
  reject_batch: 'reject this payment batch',
  approve_expense: 'approve this expense',
  reject_expense: 'reject this expense',
  cap_change: 'change this transfer cap',
  quick_pay: 'send this payment',
};

// Host, mounted once at the app root — backs requestStepUp()/submitStepUp()
// from use-step-up.ts. Only opens when company_settings.approval_step_up_required
// is on; otherwise requestStepUp() resolves immediately and this never renders.
export function StepUpDialog() {
  const req = useStepUpRequest();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setCode('');
    setError(null);
    setBusy(false);
    cancelStepUp();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await submitStepUp(password, code);
      setPassword('');
      setCode('');
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={!!req}
      onOpenChange={(open) => { if (!open) close(); }}
      title="Re-verify to continue"
      description={req ? `Confirm your password and authenticator code to ${PURPOSE_LABEL[req.purpose] || 'continue'}.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !password || code.length < 6}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
            Verify
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="step-up-password">Password</Label>
          <Input
            id="step-up-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && password && code.length >= 6) submit(); }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="step-up-code">Authenticator code</Label>
          <Input
            id="step-up-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter' && password && code.length >= 6) submit(); }}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
