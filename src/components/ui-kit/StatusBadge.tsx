import { cn } from '@/lib/utils';
import { STATUS_CONFIG, FALLBACK } from './status-utils';

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
              size === 'sm' ? 'px-2 py-0 text-3xs leading-5 min-h-[22px]' : 'px-2.5 py-0.5 text-2xs leading-5 min-h-[24px]')
          : cn('rounded-none uppercase tracking-[0.08em]', config.text,
              size === 'sm' ? 'text-3xs leading-5' : 'text-xs leading-5'),
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
