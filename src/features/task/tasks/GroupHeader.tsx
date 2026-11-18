import { ChevronDown, ChevronRight } from 'lucide-react';
import { StatusDot } from '../components/StatusDot';
import type { TaskStatus } from '../api/statuses';

export function GroupHeader({
  status,
  count,
  collapsed,
  onToggleCollapse,
}: {
  status: TaskStatus;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <button onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground" aria-label={collapsed ? 'Expand group' : 'Collapse group'}>
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <StatusDot color={status.color} />
      <span className="text-2xs font-bold uppercase tracking-wide text-foreground">{status.name}</span>
      <span className="text-2xs font-medium text-muted-foreground">{count}</span>
    </div>
  );
}
