import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  draft:                    'bg-gray-100 text-gray-600 border border-gray-200',
  pending:                  'bg-amber-50 text-amber-700 border border-amber-200',
  pending_approval:         'bg-amber-50 text-amber-700 border border-amber-200',
  pending_second_approval:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved:                 'bg-blue-50 text-blue-700 border border-blue-200',
  funded:                   'bg-indigo-50 text-indigo-700 border border-indigo-200',
  processing:               'bg-cyan-50 text-cyan-700 border border-cyan-200',
  retry:                    'bg-cyan-50 text-cyan-700 border border-cyan-200',
  processed:                'bg-green-50 text-green-800 border border-green-200',
  succeeded:                'bg-green-50 text-green-800 border border-green-200',
  completed:                'bg-green-50 text-green-800 border border-green-200',
  paid:                     'bg-green-50 text-green-800 border border-green-200',
  active:                   'bg-green-50 text-green-800 border border-green-200',
  partial:                  'bg-orange-50 text-orange-700 border border-orange-200',
  partially_processed:      'bg-orange-50 text-orange-700 border border-orange-200',
  failed:                   'bg-red-50 text-red-700 border border-red-200',
  rejected:                 'bg-red-50 text-red-700 border border-red-200',
  cancelled:                'bg-red-50 text-red-700 border border-red-200',
  reversed:                 'bg-red-50 text-red-700 border border-red-200',
  inactive:                 'bg-gray-100 text-gray-600 border border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  draft:                    'Draft',
  pending:                  'Pending',
  pending_approval:         'Pending',
  pending_second_approval:  'Pending 2nd Approval',
  approved:                 'Approved',
  funded:                   'Funded',
  processing:               'Processing',
  retry:                    'Processing',
  processed:                'Completed',
  succeeded:                'Completed',
  completed:                'Completed',
  paid:                     'Completed',
  active:                   'Active',
  partial:                  'Partial',
  partially_processed:      'Partial',
  failed:                   'Failed',
  rejected:                 'Failed',
  cancelled:                'Failed',
  reversed:                 'Reversed',
  inactive:                 'Inactive',
};

export function statusColor(status: string): string {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-600 border border-gray-200';
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status.replace(/_/g, ' ');
}

export function StatusBadge({
  status,
  size = 'default',
  className,
}: {
  status: string;
  size?: 'sm' | 'default';
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'font-medium capitalize',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-[11px]',
        statusColor(status),
        className,
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}
