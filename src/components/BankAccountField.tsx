import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  NIGERIAN_BANKS,
  fetchBanks,
  getBankCode,
  resolveAccount,
} from '@/lib/paystack';
import type { NigerianBank } from '@/lib/nigerian-banks';

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
    const bankCode = getBankCode(bank_name);

    // Only verify when we have 10 digits + a mapped bank code, and this exact
    // pair hasn't already been resolved.
    if (!bankCode || account_number.length !== 10) return;
    const key = `${bankCode}:${account_number}`;
    if (key === lastKeyRef.current && value.verified) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await resolveAccount(account_number, bankCode);
        if (cancelled) return;
        lastKeyRef.current = key;
        setVerifiedState({
          ...value,
          account_name: result.account_name,
          verified: true,
        });
      } catch (err: any) {
        if (cancelled) return;
        lastKeyRef.current = '';
        setError(err?.message || 'Could not verify account');
        setVerifiedState({
          ...value,
          account_name: '',
          verified: false,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.account_number, value.bank_name]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Bank</Label>
          <Select
            value={value.bank_name}
            onValueChange={updateBank}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select bank" />
            </SelectTrigger>
            <SelectContent>
              {banks.map((b) => (
                <SelectItem key={b.code} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <span className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
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
