import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:                    { bg: 'bg-slate-100',                    text: 'text-slate-600',   dot: 'bg-slate-400',   label: 'Draft' },
  pending:                  { bg: 'bg-amber-50  border border-amber-200/80', text: 'text-amber-700',   dot: 'bg-amber-400',   label: 'Pending' },
  pending_approval:         { bg: 'bg-amber-50  border border-amber-200/80', text: 'text-amber-700',   dot: 'bg-amber-400',   label: 'Pending' },
  pending_second_approval:  { bg: 'bg-amber-50  border border-amber-200/80', text: 'text-amber-700',   dot: 'bg-amber-400',   label: '2nd Approval' },
  approved:                 { bg: 'bg-blue-50   border border-blue-200/80',  text: 'text-blue-700',    dot: 'bg-blue-400',    label: 'Approved' },
  funded:                   { bg: 'bg-indigo-50 border border-indigo-200/80',text: 'text-indigo-700',  dot: 'bg-indigo-400',  label: 'Funded' },
  processing:               { bg: 'bg-cyan-50   border border-cyan-200/80',  text: 'text-cyan-700',    dot: 'bg-cyan-400',    label: 'Processing' },
  retry:                    { bg: 'bg-cyan-50   border border-cyan-200/80',  text: 'text-cyan-700',    dot: 'bg-cyan-400',    label: 'Processing' },
  processed:                { bg: 'bg-emerald-50 border border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Completed' },
  succeeded:                { bg: 'bg-emerald-50 border border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Completed' },
  completed:                { bg: 'bg-emerald-50 border border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Completed' },
  paid:                     { bg: 'bg-emerald-50 border border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Paid' },
  active:                   { bg: 'bg-emerald-50 border border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Active' },
  partial:                  { bg: 'bg-orange-50 border border-orange-200/80', text: 'text-orange-700', dot: 'bg-orange-400',  label: 'Partial' },
  partially_processed:      { bg: 'bg-orange-50 border border-orange-200/80', text: 'text-orange-700', dot: 'bg-orange-400',  label: 'Partial' },
  failed:                   { bg: 'bg-red-50    border border-red-200/80',   text: 'text-red-700',     dot: 'bg-red-400',     label: 'Failed' },
  rejected:                 { bg: 'bg-red-50    border border-red-200/80',   text: 'text-red-700',     dot: 'bg-red-400',     label: 'Rejected' },
  cancelled:                { bg: 'bg-red-50    border border-red-200/80',   text: 'text-red-700',     dot: 'bg-red-400',     label: 'Cancelled' },
  reversed:                 { bg: 'bg-rose-50   border border-rose-200/80',  text: 'text-rose-700',    dot: 'bg-rose-400',    label: 'Reversed' },
  inactive:                 { bg: 'bg-slate-100',                            text: 'text-slate-500',   dot: 'bg-slate-300',   label: 'Inactive' },
};

const FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: '' };

export function statusColor(status: string): string {
  const c = STATUS_CONFIG[status] ?? FALLBACK;
  return `${c.bg} ${c.text}`;
}

export function statusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status.replace(/_/g, ' ');
}

export function StatusBadge({
  status,
  size = 'default',
  showDot = true,
  className,
}: {
  status: string;
  size?: 'sm' | 'default';
  showDot?: boolean;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? FALLBACK;
  const label = config.label || status.replace(/_/g, ' ');

  // Living dots breathe for dynamic, attention-worthy statuses.
  const liveAnim =
    status === 'pending' || status === 'pending_approval' || status === 'pending_second_approval'
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
        'inline-flex items-center gap-1.5 rounded-full font-medium capitalize',
        config.bg,
        config.text,
        size === 'sm'
          ? 'px-2 py-0 text-[10px] leading-5'
          : 'px-2.5 py-0.5 text-[11px] leading-5',
        className,
      )}
    >
      {showDot && (
        <span
          className={cn(
            'inline-block rounded-full shrink-0',
            config.dot,
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-1.5 w-1.5',
            liveAnim,
          )}
        />
      )}
      {label}
    </span>
  );
}
