import { ChevronDown, ChevronRight } from 'lucide-react';
import { StatusDot } from '../components/StatusDot';

export function GroupHeader({
  label,
  color,
  count,
  collapsed,
  onToggleCollapse,
}: {
  label: string;
  color?: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <button onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground" aria-label={collapsed ? 'Expand group' : 'Collapse group'}>
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {color && <StatusDot color={color} />}
      <span className="text-2xs font-bold uppercase tracking-wide text-foreground">{label}</span>
      <span className="text-2xs font-medium text-muted-foreground">{count}</span>
    </div>
  );
}
