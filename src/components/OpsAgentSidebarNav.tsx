import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AGENT_TABS } from '@/features/ops-agent/agentTabs';
import { useAgentFlags, useAgentScope } from '@/queries/useOpsAgent';

const TONES = {
  sidebar: {
    link: 'text-sidebar-foreground/65 hover:bg-white/[0.06] hover:text-sidebar-foreground',
    linkActive: 'bg-white/[0.11] text-white',
    icon: 'text-sidebar-foreground/40',
    iconActive: 'text-[hsl(var(--sidebar-ring))]',
  },
  mobile: {
    link: 'text-foreground hover:bg-muted/60',
    linkActive: 'bg-primary/10 text-primary font-medium',
    icon: 'text-muted-foreground',
    iconActive: 'text-primary',
  },
} as const;

/** The Ops Agent sections as sidebar links: Inbox (with its open count), Chat, Summaries, Memory, Connections, Settings. */
export function OpsAgentSidebarNav({ variant = 'sidebar', onNavigate }: { variant?: keyof typeof TONES; onNavigate?: () => void }) {
  const t = TONES[variant];
  const scope = useAgentScope();
  const flags = useAgentFlags();
  const open = (flags.data ?? []).filter((f) => f.status === 'open').length;
  const tabs = AGENT_TABS.filter((tab) => !tab.superOnly || scope.data?.configure === true);

  return (
    <nav aria-label="Ops Agent" className="space-y-0.5 px-2" data-testid="agent-sidebar-nav">
      {tabs.map(({ key, label, path, icon: Icon }) => (
        <NavLink
          key={key} to={path} end={key === 'inbox'} onClick={onNavigate}
          className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm kd-transition no-underline', isActive ? t.linkActive : t.link)}
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('h-4 w-4 shrink-0', isActive ? t.iconActive : t.icon)} />
              <span className="flex-1 truncate">{label}</span>
              {key === 'inbox' && open > 0 && (
                <span className="min-w-5 rounded-full bg-warning px-1.5 text-center text-3xs font-bold text-warning-foreground" aria-label={`${open} open`}>{open > 99 ? '99+' : open}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
