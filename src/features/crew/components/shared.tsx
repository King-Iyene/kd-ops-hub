import { cn } from '@/lib/utils';
import type { CrewAgent, Risk } from '../crewDb';
import { STATUS_LABEL } from '../orgChart';

const STATUS_DOT: Record<string, string> = {
  offline: 'bg-muted-foreground/40', idle: 'bg-emerald-500', working: 'bg-blue-500', thinking: 'bg-violet-500',
  waiting_approval: 'bg-amber-500', walking: 'bg-sky-500', meeting: 'bg-fuchsia-500',
};

export function Avatar({ agent, size = 36 }: { agent: Pick<CrewAgent, 'name' | 'color'>; size?: number }) {
  const initials = agent.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: agent.color, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status] ?? STATUS_DOT.offline)} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const tone = risk === 'high' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : risk === 'medium' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', tone)}>{risk} risk</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
