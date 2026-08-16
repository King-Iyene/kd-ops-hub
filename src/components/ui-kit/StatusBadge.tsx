import { cn } from '@/lib/utils';

// Each status keeps its own hue (so Approved/Funded/Processing stay visually
// distinct) and now carries dark-mode variants so pills don't render as washed
// light chips on a dark surface.
const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:                    { bg: 'bg-slate-100 dark:bg-slate-500/15',                                              text: 'text-slate-600 dark:text-slate-300',   dot: 'bg-slate-400',   label: 'Draft' },
  pending:                  { bg: 'bg-amber-50 border border-amber-200/80 dark:bg-amber-500/10 dark:border-amber-500/25',     text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-400',   label: 'Pending' },
  pending_approval:         { bg: 'bg-amber-50 border border-amber-200/80 dark:bg-amber-500/10 dark:border-amber-500/25',     text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-400',   label: 'Pending' },
  pending_second_approval:  { bg: 'bg-amber-50 border border-amber-200/80 dark:bg-amber-500/10 dark:border-amber-500/25',     text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-400',   label: '2nd Approval' },
  approved:                 { bg: 'bg-blue-50 border border-blue-200/80 dark:bg-blue-500/10 dark:border-blue-500/25',         text: 'text-blue-700 dark:text-blue-300',     dot: 'bg-blue-400',    label: 'Approved' },
  funded:                   { bg: 'bg-indigo-50 border border-indigo-200/80 dark:bg-indigo-500/10 dark:border-indigo-500/25', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-400',  label: 'Funded' },
  processing:               { bg: 'bg-cyan-50 border border-cyan-200/80 dark:bg-cyan-500/10 dark:border-cyan-500/25',         text: 'text-cyan-700 dark:text-cyan-300',     dot: 'bg-cyan-400',    label: 'Processing' },
  retry:                    { bg: 'bg-cyan-50 border border-cyan-200/80 dark:bg-cyan-500/10 dark:border-cyan-500/25',         text: 'text-cyan-700 dark:text-cyan-300',     dot: 'bg-cyan-400',    label: 'Processing' },
  processed:                { bg: 'bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-500/10 dark:border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', label: 'Completed' },
  succeeded:                { bg: 'bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-500/10 dark:border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', label: 'Completed' },
  completed:                { bg: 'bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-500/10 dark:border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', label: 'Completed' },
  paid:                     { bg: 'bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-500/10 dark:border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', label: 'Paid' },
  active:                   { bg: 'bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-500/10 dark:border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', label: 'Active' },
  partial:                  { bg: 'bg-orange-50 border border-orange-200/80 dark:bg-orange-500/10 dark:border-orange-500/25', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-400',  label: 'Partial' },
  partially_processed:      { bg: 'bg-orange-50 border border-orange-200/80 dark:bg-orange-500/10 dark:border-orange-500/25', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-400',  label: 'Partial' },
  failed:                   { bg: 'bg-red-50 border border-red-200/80 dark:bg-red-500/10 dark:border-red-500/25',             text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-400',     label: 'Failed' },
  rejected:                 { bg: 'bg-red-50 border border-red-200/80 dark:bg-red-500/10 dark:border-red-500/25',             text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-400',     label: 'Rejected' },
  cancelled:                { bg: 'bg-red-50 border border-red-200/80 dark:bg-red-500/10 dark:border-red-500/25',             text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-400',     label: 'Cancelled' },
  reversed:                 { bg: 'bg-rose-50 border border-rose-200/80 dark:bg-rose-500/10 dark:border-rose-500/25',         text: 'text-rose-700 dark:text-rose-300',     dot: 'bg-rose-400',    label: 'Reversed' },
  inactive:                 { bg: 'bg-slate-100 dark:bg-slate-500/15',                                              text: 'text-slate-500 dark:text-slate-400',   dot: 'bg-slate-300',   label: 'Inactive' },
  remitted:                 { bg: 'bg-blue-50 border border-blue-200/80 dark:bg-blue-500/10 dark:border-blue-500/25',           text: 'text-blue-700 dark:text-blue-300',     dot: 'bg-blue-400',    label: 'Remitted' },
  confirmed:                { bg: 'bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-500/10 dark:border-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', label: 'Confirmed' },
  late:                     { bg: 'bg-red-50 border border-red-200/80 dark:bg-red-500/10 dark:border-red-500/25',               text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-400',     label: 'Late' },
  otp_blocked:              { bg: 'bg-purple-50 border border-purple-200/80 dark:bg-purple-500/10 dark:border-purple-500/25', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-400',  label: 'OTP Required' },
};

const FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: '' };

export function statusColor(status: string): string {
  const c = STATUS_CONFIG[status] ?? FALLBACK;
  return `${c.bg} ${c.text}`;
}

export function statusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status.replace(/_/g, ' ');
}

// ── Reusable tone palette ────────────────────────────────────────
//
// Centralised tone classes for any UI surface that wants the same
// visual vocabulary as StatusBadge but isn't a literal status pill —
// activity feed entries, KPI deltas, log rows, anomaly chips, etc.
// Use the keyword shape ("success" / "warning" / etc.) so callers
// don't have to know the underlying colour stops; tweaking the
// palette later only happens in one place.

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10',
  warning: 'text-amber-700   bg-amber-50   dark:text-amber-300   dark:bg-amber-500/10',
  danger:  'text-red-700     bg-red-50     dark:text-red-300     dark:bg-red-500/10',
  info:    'text-blue-700    bg-blue-50    dark:text-blue-300    dark:bg-blue-500/10',
  neutral: 'text-slate-600   bg-slate-100  dark:text-slate-300   dark:bg-slate-500/15',
};

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone] ?? TONE_CLASS.neutral;
}

// Heuristic that picks a tone from a free-form action / event type.
// First match wins. Used by activity feeds and anomaly logs so the
// row tint stays consistent with StatusBadge across the platform.
export function toneFor(action: string): Tone {
  const a = (action || '').toLowerCase();
  if (/(success|approved|paid|completed|processed|succeeded|active|renewed|added|confirmed|received|delivered)/.test(a)) return 'success';
  if (/(failed|reject|cancel|reverse|denied|deleted|removed|critical|breach|error|expired|overdue|fraud)/.test(a))         return 'danger';
  if (/(pending|warn|alert|low|stale|stuck|retry|due|expiring|partial)/.test(a))                                            return 'warning';
  if (/(created|submitted|drafted|edited|updated|invited|funded|processing|recall|view|read)/.test(a))                       return 'info';
  return 'neutral';
}

export function StatusBadge({
  status,
  size = 'default',
  showDot = true,
  variant = 'fill',
  className,
}: {
  status: string;
  size?: 'sm' | 'default';
  showDot?: boolean;
  /** `fill` = soft pastel pill (US default). `outline` = no fill, dot + coloured text only (German / Swedish bank standard). */
  variant?: 'fill' | 'outline';
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? FALLBACK;
  const label = config.label || status.replace(/_/g, ' ');

  // Living dots breathe for dynamic, attention-worthy statuses.
  const liveAnim =
    status === 'pending' || status === 'pending_approval' || status === 'pending_second_approval' || status === 'otp_blocked'
      ? 'kd-status-live-warning'
      : status === 'processing' || status === 'retry'
        ? 'kd-status-live-cyan'
        : status === 'failed' || status === 'rejected'
          ? 'kd-status-live-danger'
          : status === 'active' || status === 'succeeded'
            ? 'kd-status-live-success'
            : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium',
        variant === 'fill'
          ? cn('rounded-full capitalize', config.bg, config.text,
              size === 'sm' ? 'px-2 py-0 text-[10px] leading-5' : 'px-2.5 py-0.5 text-[11px] leading-5')
          : cn('rounded-none uppercase tracking-[0.08em]', config.text,
              size === 'sm' ? 'text-[10px] leading-5' : 'text-[10.5px] leading-5'),
        className,
      )}
    >
      {showDot && (
        <span
          className={cn(
            'inline-block shrink-0',
            config.dot,
            variant === 'fill' ? 'rounded-full' : 'rounded-none',
            'h-1.5 w-1.5',
            liveAnim,
          )}
        />
      )}
      {label}
    </span>
  );
}
