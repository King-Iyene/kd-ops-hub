import { NavLink, useLocation } from 'react-router-dom';
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
  // /agent/inbox?flag=<id> is a link to an item in the Inbox, so the Inbox stays highlighted there.
  const onInboxPath = useLocation().pathname.startsWith('/agent/inbox');
  const scope = useAgentScope();
  const flags = useAgentFlags();
  const openFlags = (flags.data ?? []).filter((f) => f.status === 'open');
  const open = openFlags.length;
  const urgent = openFlags.filter((f) => f.severity === 'high' || f.severity === 'critical').length;
  const tabs = AGENT_TABS.filter((tab) => !tab.superOnly || scope.data?.configure === true);

  return (
    <nav aria-label="Ops Agent" className="space-y-0.5 px-2" data-testid="agent-sidebar-nav">
      {tabs.map(({ key, label, path, icon: Icon }) => (
        <NavLink
          key={key} to={path} end={key === 'inbox'} onClick={onNavigate}
          className={({ isActive: a }) => { const isActive = a || (key === 'inbox' && onInboxPath); return cn('relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm kd-transition no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]', isActive ? t.linkActive : t.link); }}
        >
          {({ isActive: a }) => { const isActive = a || (key === 'inbox' && onInboxPath); return (
            <>
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[hsl(var(--sidebar-ring))]" aria-hidden="true" />}
              <Icon className={cn('h-4 w-4 shrink-0', isActive ? t.iconActive : t.icon)} />
              <span className="flex-1 truncate">{label}</span>
              {key === 'inbox' && open > 0 && (
                <span
                  className={cn('min-w-5 rounded-full px-1.5 text-center text-3xs font-bold tabular-nums', urgent > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground')}
                  aria-label={urgent > 0 ? `${open} open, ${urgent} urgent` : `${open} open`} title={urgent > 0 ? `${urgent} high or critical` : undefined}
                >{open > 99 ? '99+' : open}</span>
              )}
            </>
          ); }}
        </NavLink>
      ))}
    </nav>
  );
}
