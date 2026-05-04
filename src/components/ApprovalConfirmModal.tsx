// Step-up authentication modal for approval / rejection actions.
//
// Flow:
//   1. User opens modal (button click).
//   2. User enters password + 6-digit TOTP code (+ rejection reason if rejecting).
//   3. Modal calls verifyMfa() → Supabase Auth → AAL2.
//   4. Modal calls createStepUpSession() → DB verifies password + AAL2 → token.
//   5. Modal calls onConfirm(token, reason?) → caller performs the RPC.
//
// If the user has no verified TOTP factor configured, a setup prompt is shown
// instead of the form. Lockout (3 failures in 60 min) is surfaced clearly.

import { useEffect, useRef, useState } from 'react';
import { Loader2, Shield, Eye, EyeOff, AlertTriangle, KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { listMfaFactors, verifyMfa } from '@/lib/mfa';
import {
  createStepUpSession,
  StepUpLockedError,
  StepUpNoTotpError,
  type StepUpPurpose,
} from '@/lib/step-up';

export interface ApprovalConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: StepUpPurpose;
  resourceId?: string | null;
  /** Short human-readable line shown below the title, e.g. "Batch: August Payroll — ₦2,450,000" */
  description: string;
  /** Button label (default: "Confirm") */
  confirmLabel?: string;
  /** Called once step-up succeeds.
   *  `reason` is populated only when purpose starts with "reject_". */
  onConfirm: (stepUpToken: string, reason?: string) => void | Promise<void>;
}

const isRejectPurpose = (p: StepUpPurpose) =>
  p === 'reject_batch' || p === 'reject_expense';

const purposeTitle: Record<StepUpPurpose, string> = {
  approve_batch:   'Confirm Approval',
  approve_expense: 'Confirm Approval',
  reject_batch:    'Confirm Rejection',
  reject_expense:  'Confirm Rejection',
  cap_change:      'Confirm Limit Change',
  quick_pay:       'Confirm Payment',
};

export function ApprovalConfirmModal(props: ApprovalConfirmModalProps) {
  const { open, onOpenChange, purpose, resourceId, description, onConfirm } = props;
  const confirmLabel = props.confirmLabel ?? (isRejectPurpose(purpose) ? 'Reject' : 'Confirm');

  const { toast } = useToast();

  const [password, setPassword]       = useState('');
  const [showPwd,  setShowPwd]        = useState(false);
  const [totp,     setTotp]           = useState('');
  const [reason,   setReason]         = useState('');
  const [busy,     setBusy]           = useState(false);
  const [error,    setError]          = useState<string | null>(null);
  const [locked,   setLocked]         = useState(false);
  const [noTotp,   setNoTotp]         = useState(false);
  const [factorId, setFactorId]       = useState<string | null>(null);
  const [factorLoading, setFactorLoading] = useState(true);

  const passwordRef = useRef<HTMLInputElement>(null);

  // Reset form whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setPassword('');
    setTotp('');
    setReason('');
    setError(null);
    setLocked(false);
    setNoTotp(false);
    setFactorLoading(true);

    listMfaFactors().then(({ totpEnrolled, factorId: fid }) => {
      setNoTotp(!totpEnrolled);
      setFactorId(fid);
      setFactorLoading(false);
      // Autofocus password after factors load.
      setTimeout(() => passwordRef.current?.focus(), 50);
    });
  }, [open]);

  const canSubmit =
    !busy &&
    !locked &&
    !noTotp &&
    password.length >= 1 &&
    totp.replace(/\s/g, '').length === 6 &&
    (!isRejectPurpose(purpose) || reason.trim().length >= 10);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // Step 1: Supabase Auth TOTP verify → elevates session to AAL2.
      if (!factorId) throw new Error('No TOTP factor found');
      await verifyMfa(factorId, totp);

      // Step 2: RPC verifies password + AAL2, creates session row.
      const token = await createStepUpSession({
        password,
        totpCode: totp,
        purpose,
        resourceId: resourceId ?? null,
      });

      // Step 3: Delegate to caller with the token (and reason for rejections).
      onOpenChange(false);
      await onConfirm(token, isRejectPurpose(purpose) ? reason.trim() : undefined);
    } catch (err: any) {
      if (err instanceof StepUpLockedError) {
        setLocked(true);
        setError(err.message);
      } else if (err instanceof StepUpNoTotpError) {
        setNoTotp(true);
        setError(err.message);
      } else {
        const msg: string = err?.message ?? 'Authentication failed. Please try again.';
        setError(msg);
        // Clear fields on wrong code / wrong password so the user re-enters.
        if (msg.toLowerCase().includes('password')) {
          setPassword('');
          setTimeout(() => passwordRef.current?.focus(), 50);
        } else {
          setTotp('');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!busy) onOpenChange(v); }}
    >
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e)       => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            {purposeTitle[purpose]}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {factorLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : noTotp ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Two-factor authentication is required before you can approve or reject
              items. Go to <strong>Settings → Security</strong> to set up your
              authenticator app.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {locked && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!locked && error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Rejection reason — only for reject actions */}
            {isRejectPurpose(purpose) && (
              <div className="space-y-1.5">
                <Label htmlFor="su-reason">Reason for rejection</Label>
                <Textarea
                  id="su-reason"
                  placeholder="Provide a clear reason (min 10 characters)…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy || locked}
                  rows={3}
                  className="resize-none"
                />
                {reason.trim().length > 0 && reason.trim().length < 10 && (
                  <p className="text-xs text-destructive">
                    At least 10 characters required
                  </p>
                )}
              </div>
            )}

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="su-password">Your password</Label>
              <div className="relative">
                <Input
                  id="su-password"
                  ref={passwordRef}
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
                  disabled={busy || locked}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPwd
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye    className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* TOTP */}
            <div className="space-y-1.5">
              <Label htmlFor="su-totp" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Authenticator code
              </Label>
              <Input
                id="su-totp"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
                disabled={busy || locked}
                className="font-mono text-center text-lg tracking-widest"
              />
              <p className="text-xs text-muted-foreground">
                6-digit code from your authenticator app
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>

          {!noTotp && (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              variant={isRejectPurpose(purpose) ? 'destructive' : 'default'}
            >
              {busy
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Re-authenticating…</>
                : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
