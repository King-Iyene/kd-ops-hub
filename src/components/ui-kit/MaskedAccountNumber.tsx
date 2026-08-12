import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { maskAccountNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MaskedAccountNumberProps {
  value: string | null | undefined;
  className?: string;
  /** Extra classes on the reveal/hide toggle button. */
  buttonClassName?: string;
}

/**
 * Bank account number displayed masked by default (last 4 digits only),
 * with a password-style eye-icon toggle to reveal the full number. The
 * value is already present on the client in every current call site — this
 * only changes what's shown by default, matching the reveal pattern already
 * used for passwords (ContractorProfile) and balances (PaystackBalanceCard).
 */
export function MaskedAccountNumber({ value, className, buttonClassName }: MaskedAccountNumberProps) {
  const [revealed, setRevealed] = useState(false);

  if (!value) return <span className={className}>—</span>;

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono tabular-nums', className)}>
      {revealed ? value : maskAccountNumber(value)}
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className={cn(
          'text-muted-foreground hover:text-foreground transition-colors',
          buttonClassName,
        )}
        aria-label={revealed ? 'Hide account number' : 'Show account number'}
        title={revealed ? 'Hide account number' : 'Show account number'}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
