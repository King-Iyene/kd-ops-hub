import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  NIGERIAN_BANKS,
  fetchBanks,
  getBankCode,
  resolveAccount,
  clearBankCache,
} from '@/lib/paystack';
import type { NigerianBank } from '@/lib/nigerian-banks';
import { BankCombobox } from '@/components/BankCombobox';

export interface BankAccountValue {
  bank_name: string;
  account_number: string;
  account_name: string; // resolved/verified holder name
  verified: boolean;
}

interface Props {
  value: BankAccountValue;
  onChange: (v: BankAccountValue) => void;
  /** Called when verified status flips. Useful for disabling submit buttons. */
  onVerifiedChange?: (verified: boolean) => void;
  disabled?: boolean;
}

/**
 * A drop-in bank account field that:
 *   - lets the user pick a Nigerian bank
 *   - collects a 10-digit account number
 *   - auto-verifies via Paystack once both inputs are complete
 *   - shows the verified account holder name in green
 *
 * Forms that embed this component should refuse to submit while
 * `value.verified` is false.
 */
export function BankAccountField({
  value,
  onChange,
  onVerifiedChange,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef<string>('');
  // Incremented by the "Refresh bank list" button so the verify effect
  // re-runs even when account_number / bank_name haven't changed. Without
  // this, clicking Refresh did nothing visible because the effect's deps
  // didn't change — the bug behind the "Verifying… stuck forever" report.
  const [refreshKey, setRefreshKey] = useState(0);
  // Start with static list immediately; fetch full list (~300+ banks) in background.
  const [banks, setBanks] = useState<NigerianBank[]>(NIGERIAN_BANKS);
  useEffect(() => {
    fetchBanks().then(setBanks).catch(() => { /* keep static list */ });
  }, []);

  const setVerifiedState = (next: BankAccountValue) => {
    onChange(next);
    onVerifiedChange?.(next.verified);
  };

  const updateBank = (bank_name: string) => {
    setError(null);
    setVerifiedState({
      ...value,
      bank_name,
      account_name: '',
      verified: false,
    });
  };

  const updateAccountNumber = (account_number: string) => {
    // keep digits only, cap at 10
    const digits = account_number.replace(/\D/g, '').slice(0, 10);
    setError(null);
    setVerifiedState({
      ...value,
      account_number: digits,
      account_name: '',
      verified: false,
    });
  };

  useEffect(() => {
    const { account_number, bank_name } = value;
    const initialBankCode = getBankCode(bank_name);

    // Only verify when we have 10 digits + a mapped bank code, and this exact
    // pair hasn't already been resolved.
    if (!initialBankCode || account_number.length !== 10) return;
    const key = `${initialBankCode}:${account_number}`;
    if (key === lastKeyRef.current && value.verified) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);

      /** Hit Paystack /bank/resolve once with the given bank code. Returns
       *  the resolved result on success, throws the original error on
       *  failure. */
      const tryResolve = async (code: string) => resolveAccount(account_number, code);

      try {
        // First attempt with the cached code lookup.
        const result = await tryResolve(initialBankCode);
        if (cancelled) return;
        lastKeyRef.current = key;
        setVerifiedState({ ...value, account_name: result.account_name, verified: true });
      } catch (err: any) {
        if (cancelled) return;

        // Auto-recovery: Paystack occasionally rotates PSB / fintech codes
        // (Airtel Smartcash, MTN MoMo, PalmPay sub-codes). When the resolve
        // fails because the cached code is stale, clear the local bank list,
        // refetch the current list from Paystack's /bank, look the code up
        // again, and retry ONCE with the fresh code. This silently fixes the
        // common "Could not resolve account" for valid accounts that Paystack
        // itself can resolve. NEVER touches transfer / dispatch — this is
        // the verify path only.
        try {
          clearBankCache();
          // Hard timeout on the refetch so a slow / hung list_banks call can
          // never strand the verify in "Verifying…" forever. 6s is generous
          // (the call usually returns in <200ms) — anything longer is
          // assumed dead and we fall through to surface the original error.
          const timeoutMs = 6000;
          const fresh = await Promise.race<NigerianBank[]>([
            fetchBanks(),
            new Promise<NigerianBank[]>((_, reject) =>
              setTimeout(() => reject(new Error('bank-list refresh timeout')), timeoutMs),
            ),
          ]);
          if (cancelled) return;
          if (fresh.length > 0) setBanks(fresh);
          const refreshedCode = getBankCode(bank_name);
          if (refreshedCode && refreshedCode !== initialBankCode) {
            const retried = await tryResolve(refreshedCode);
            if (cancelled) return;
            lastKeyRef.current = `${refreshedCode}:${account_number}`;
            setVerifiedState({ ...value, account_name: retried.account_name, verified: true });
            return;
          }
        } catch (_recoveryErr) { /* fall through to the original error */ }

        if (cancelled) return;
        lastKeyRef.current = '';
        setError(err?.message || 'Could not verify account');
        setVerifiedState({ ...value, account_name: '', verified: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.account_number, value.bank_name, refreshKey]);

  /** Manual escape hatch — operator clicks "Refresh bank list" on an error.
   *  Forces a fresh fetch, clears the dedup key, and bumps refreshKey so the
   *  verify useEffect actually re-runs (its deps include refreshKey). Without
   *  the refreshKey bump, account_number / bank_name don't change and React
   *  silently skips the effect — the bug behind "click Refresh, nothing
   *  happens". */
  const refreshAndRetry = async () => {
    setError(null);
    clearBankCache();
    try {
      const fresh = await Promise.race<NigerianBank[]>([
        fetchBanks(),
        new Promise<NigerianBank[]>((_, reject) =>
          setTimeout(() => reject(new Error('refresh timeout')), 6000),
        ),
      ]);
      if (fresh.length > 0) setBanks(fresh);
    } catch { /* surface no error here; the effect re-run will surface its own */ }
    lastKeyRef.current = '';
    setRefreshKey((k) => k + 1); // forces the verify effect to re-run
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Bank</Label>
          <BankCombobox
            value={value.bank_name}
            onChange={(name) => updateBank(name)}
            banks={banks}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Account Number</Label>
          <Input
            inputMode="numeric"
            maxLength={10}
            placeholder="10 digits"
            value={value.account_number}
            onChange={(e) => updateAccountNumber(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="min-h-[24px] text-sm flex items-center gap-2">
        {loading && (
          <span className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying account...
          </span>
        )}
        {!loading && value.verified && value.account_name && (
          <span className="text-success flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {value.account_name}
          </span>
        )}
        {!loading && error && (
          <span className="text-destructive flex items-center gap-2 flex-wrap">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={refreshAndRetry}
              className="underline text-xs text-destructive/80 hover:text-destructive ml-1"
              title="Some bank codes (PSBs / fintechs) change occasionally. Refresh fetches the current Paystack list and retries."
            >
              Refresh bank list
            </button>
          </span>
        )}
        {!loading &&
          !error &&
          !value.verified &&
          value.bank_name &&
          value.account_number.length === 10 && (
            <span className="text-muted-foreground">Verifying...</span>
          )}
      </div>
    </div>
  );
}
