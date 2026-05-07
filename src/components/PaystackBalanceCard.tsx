/**
 * PaystackBalanceCard
 *
 * Header-row wallet card for the Payments page. Surfaces three things:
 *   1. Current Paystack NGN wallet balance (with hide/show toggle).
 *   2. The funding-account details (bank, account name, account number)
 *      so an operator can copy-paste them into a banking app to top up.
 *      Funding details are read from `company_settings` — Paystack does
 *      not expose the merchant's own PT funding account via public API
 *      (the dashboard.paystack.com → Settings → Funding page is the
 *      source of truth, and operators copy it once into KD-Ops Settings).
 *   3. Quick links into the Paystack dashboard for funding + transfers.
 *
 * Colour tone is derived from the balance only — the card chrome stays
 * neutral so it works in both light and dark themes:
 *   • healthy (≥ low-threshold)        → emerald accent
 *   • low      (< low, ≥ critical)     → amber  accent
 *   • critical (< critical-threshold)  → red    accent
 *
 * Numbers use `tabular-nums` so digits don't shift width when the
 * balance changes — matches how every fintech card renders money.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, RefreshCw, AlertTriangle, Eye, EyeOff, Copy, Check,
  Plus, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const LOW_BALANCE_THRESHOLD = 50_000;
const CRITICAL_BALANCE_THRESHOLD = 5_000;

type Tone = 'healthy' | 'low' | 'critical' | 'unknown';

const toneFor = (available: number | null): Tone => {
  if (available === null) return 'unknown';
  if (available < CRITICAL_BALANCE_THRESHOLD) return 'critical';
  if (available < LOW_BALANCE_THRESHOLD) return 'low';
  return 'healthy';
};

// Centralised tone palette — keeping every variant in one place avoids
// the colour drift that creeps in when the same shade is repeated inline
// across light/dark contexts.
const TONE: Record<Tone, {
  accentBar:  string;  // top accent strip
  iconWrap:   string;  // small wallet icon background
  icon:       string;  // wallet icon colour
  dot:        string;  // status dot
  dotPulse:   string;  // matching pulse animation class
  amount:     string;  // balance number
  banner?:    string;  // optional warning banner classes
  bannerText?:string;
  caption:    string;  // "Available for transfers" colour
}> = {
  healthy: {
    accentBar:  'bg-gradient-to-r from-emerald-400/40 via-emerald-500 to-cyan-400/40',
    iconWrap:   'bg-emerald-500/10 dark:bg-emerald-400/10',
    icon:       'text-emerald-600 dark:text-emerald-400',
    dot:        'bg-emerald-500',
    dotPulse:   'kd-status-live-success',
    amount:     'text-foreground',
    caption:    'text-muted-foreground',
  },
  low: {
    accentBar:  'bg-gradient-to-r from-amber-400/40 via-amber-500 to-amber-300/40',
    iconWrap:   'bg-amber-500/10 dark:bg-amber-400/10',
    icon:       'text-amber-600 dark:text-amber-400',
    dot:        'bg-amber-500',
    dotPulse:   'kd-status-live-warning',
    amount:     'text-foreground',
    banner:     'bg-amber-500/10 border border-amber-500/20 dark:bg-amber-400/10 dark:border-amber-400/20',
    bannerText: 'text-amber-700 dark:text-amber-300',
    caption:    'text-amber-700 dark:text-amber-300/90',
  },
  critical: {
    accentBar:  'bg-gradient-to-r from-red-500/40 via-red-500 to-rose-400/40',
    iconWrap:   'bg-red-500/10 dark:bg-red-400/10',
    icon:       'text-red-600 dark:text-red-400',
    dot:        'bg-red-500',
    dotPulse:   'kd-status-live-danger',
    amount:     'text-red-600 dark:text-red-400',
    banner:     'bg-red-500/10 border border-red-500/20 dark:bg-red-400/10 dark:border-red-400/20',
    bannerText: 'text-red-700 dark:text-red-300',
    caption:    'text-red-700 dark:text-red-300/90',
  },
  unknown: {
    accentBar:  'bg-gradient-to-r from-slate-400/30 via-slate-500/40 to-slate-400/30',
    iconWrap:   'bg-muted',
    icon:       'text-muted-foreground',
    dot:        'bg-muted-foreground',
    dotPulse:   '',
    amount:     'text-foreground',
    caption:    'text-muted-foreground',
  },
};

const fmtCompactNgn = (n: number) =>
  n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface FundingDetails {
  bank: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

interface Props {
  balance: { available: number; currency: string } | null;
  balanceLoading: boolean;
  balanceError: boolean;
  balanceUpdatedAt: string | null;
  balanceHidden: boolean;
  toggleBalanceHidden: () => void;
  fetchBalance: () => void;
  funding: FundingDetails | null;
}

export function PaystackBalanceCard({
  balance, balanceLoading, balanceError, balanceUpdatedAt,
  balanceHidden, toggleBalanceHidden, fetchBalance, funding,
}: Props) {
  const navigate = useNavigate();
  const tone = toneFor(balance?.available ?? null);
  const t = TONE[tone];
  const hasFunding = !!funding && (
    !!funding.bank || !!funding.accountName || !!funding.accountNumber
  );

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-card overflow-hidden',
        'shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] kd-transition',
        'w-full sm:w-auto sm:min-w-[300px] sm:max-w-[340px]',
      )}
    >
      {/* Top accent strip — colour cues the tone without flooding the card */}
      <div className={cn('h-[3px] w-full', t.accentBar)} />

      <div className="p-4">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', t.iconWrap)}>
              <Wallet className={cn('h-3.5 w-3.5', t.icon)} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Paystack Wallet
              </p>
              <p className="text-[10px] text-muted-foreground/60">NGN · live</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={toggleBalanceHidden}
              label={balanceHidden ? 'Show balance' : 'Hide balance'}
            >
              {balanceHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton
              onClick={fetchBalance}
              disabled={balanceLoading}
              label="Refresh balance"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', balanceLoading && 'animate-spin')} />
            </IconButton>
          </div>
        </div>

        {/* ── Balance ──────────────────────────────────────────── */}
        {balanceLoading && balance === null ? (
          <div className="space-y-1.5">
            <div className="h-9 w-40 kd-skeleton rounded" />
            <div className="h-3 w-28 kd-skeleton rounded" />
          </div>
        ) : balanceError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
            <p className="text-xs font-medium text-destructive">Could not load balance</p>
            <button
              onClick={fetchBalance}
              className="text-[11px] text-destructive/80 hover:text-destructive underline underline-offset-2 mt-0.5"
            >
              Retry
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-base font-medium leading-none mt-1', t.amount)}>₦</span>
              <span className={cn(
                'text-3xl font-bold tracking-tight tabular-nums leading-none',
                t.amount,
              )}>
                {balanceHidden
                  ? '•••••••'
                  : (balance ? fmtCompactNgn(balance.available) : '—')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn('h-1.5 w-1.5 rounded-full shrink-0', t.dot, t.dotPulse)}
                />
                <span className={cn('text-[11px] truncate', t.caption)}>
                  {tone === 'critical'
                    ? 'Critical — fund now'
                    : tone === 'low'
                      ? 'Low — fund before processing'
                      : 'Available for transfers'}
                </span>
              </div>
              {balanceUpdatedAt && (
                <RelativeAge
                  iso={balanceUpdatedAt}
                  className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0"
                />
              )}
            </div>
          </div>
        )}

        {/* ── Low / critical banner ────────────────────────────── */}
        {(tone === 'low' || tone === 'critical') && t.banner && (
          <div className={cn('flex items-start gap-2 mt-3 rounded-lg px-2.5 py-2', t.banner)}>
            <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', t.bannerText)} />
            <p className={cn('text-[11px] leading-snug font-medium', t.bannerText)}>
              {tone === 'critical'
                ? 'Wallet is critically low. Fund this account before any new transfers.'
                : 'Top up before your next batch — funded transfers won\'t go out otherwise.'}
            </p>
          </div>
        )}

        {/* ── Funding details ──────────────────────────────────── */}
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
              Fund this account
            </p>
            {hasFunding && (
              <button
                onClick={() => navigate('/settings#paystack')}
                className="text-[10px] text-muted-foreground/60 hover:text-foreground kd-transition"
                title="Edit funding details"
              >
                Edit
              </button>
            )}
          </div>

          {hasFunding ? (
            <div className="space-y-0.5">
              {funding!.bank && (
                <FundingRow label="Bank"    value={funding!.bank!} />
              )}
              {funding!.accountName && (
                <FundingRow label="Name"    value={funding!.accountName!} />
              )}
              {funding!.accountNumber && (
                <FundingRow label="Account" value={funding!.accountNumber!} mono />
              )}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/settings#paystack')}
                  className={cn(
                    'group flex w-full items-center justify-between gap-2 rounded-lg',
                    'border border-dashed border-border/80 hover:border-primary/40',
                    'bg-muted/30 hover:bg-primary/5',
                    'px-2.5 py-2 kd-transition',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                    <Plus className="h-3 w-3" />
                    Add funding account
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                Paystack doesn't expose your PT funding account via API. Copy
                the bank, name and account number from <span className="font-medium">dashboard.paystack.com → Settings → Funding</span> into KD-Ops once.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] font-medium"
            onClick={() => window.open('https://dashboard.paystack.com/#/balance/', '_blank')}
          >
            Fund Wallet
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] font-medium"
            onClick={() => window.open('https://dashboard.paystack.com/#/transfers', '_blank')}
          >
            Transfers
            <ArrowUpRight className="ml-0.5 h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function IconButton({
  children, onClick, disabled, label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md',
        'text-muted-foreground/70 hover:text-foreground hover:bg-muted',
        'kd-transition disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function FundingRow({
  label, value, mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* ignore */ }
  };
  return (
    <CopyButton onCopy={onCopy} label={label}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0 w-14">
        {label}
      </span>
      <span className={cn(
        'text-[11.5px] font-medium text-foreground truncate flex-1 text-right',
        mono && 'font-mono tracking-tight',
      )}>
        {value}
      </span>
    </CopyButton>
  );
}

function CopyButton({
  children, onCopy, label,
}: {
  children: React.ReactNode;
  onCopy: () => void;
  label: string;
}) {
  // Inline state via React.useState to avoid lifting up — each row tracks
  // its own "just copied" feedback for the 1.4s animation.
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={cn(
        'group flex w-full items-center justify-between gap-2 text-left',
        'rounded-md px-1.5 -mx-1.5 py-1 hover:bg-muted/60 kd-transition',
      )}
      title={`Copy ${label.toLowerCase()}`}
    >
      {children}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground/40 group-hover:text-foreground shrink-0 kd-transition" />
      )}
    </button>
  );
}

// Relative-age clock that ticks while the panel is mounted. Returns
// "just now" → "5 sec ago" → "2 min ago" → "1h ago" → "3h ago" → "1d ago".
// Re-renders every 10s for the first minute (so the "just now" → "X sec
// ago" transition is snappy), then every 30s thereafter — fast enough
// that "1m ago" doesn't sit stale, slow enough that idle tabs aren't
// busy-rendering.
function RelativeAge({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const ageMs = now - new Date(iso).getTime();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = ageMs < 60_000 ? 5_000 : 30_000;
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [ageMs]);

  let label: string;
  if (ageMs < 5_000)        label = 'just now';
  else if (ageMs < 60_000)  label = `${Math.round(ageMs / 1_000)} sec ago`;
  else if (ageMs < 3_600_000) {
    const m = Math.round(ageMs / 60_000);
    label = `${m} min${m === 1 ? '' : 's'} ago`;
  }
  else if (ageMs < 86_400_000) {
    const h = Math.round(ageMs / 3_600_000);
    label = `${h}h ago`;
  }
  else {
    const d = Math.round(ageMs / 86_400_000);
    label = `${d}d ago`;
  }

  return (
    <span
      className={className}
      title={new Date(iso).toLocaleString('en-NG')}
    >
      Updated {label}
    </span>
  );
}

