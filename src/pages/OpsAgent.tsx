import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAgentScope } from '@/queries/useOpsAgent';
import { useAgentFlagsRealtime } from '@/queries/useOpsAgentLive';
import { AgentBanners } from '@/features/ops-agent/AgentBanners';
import { AGENT_TABS, tabFromSplat } from '@/features/ops-agent/agentTabs';
import { InboxTab } from '@/features/ops-agent/tabs/InboxTab';
import { SummariesTab } from '@/features/ops-agent/tabs/SummariesTab';
import { ChatTab } from '@/features/ops-agent/tabs/ChatTab';
import { ConnectionsTab } from '@/features/ops-agent/tabs/ConnectionsTab';
import { SettingsTab } from '@/features/ops-agent/settings/SettingsTab';

const DESCRIPTIONS = {
  inbox: 'Live monitoring of the KD Squares team, and everything the agent wants a person to look at. It never changes a record and never sends anything by itself.',
  chat: 'Ask about tasks, daily reports, hours and leave. Answers come from live data you are allowed to see.',
  summaries: 'Daily, weekly and monthly write-ups, made on a schedule.',
  connections: 'Where the agent can send messages, and how other systems can send it items.',
  settings: 'The Claude key and budget, the team, the business calendar, coverage, the monitoring rules and the standing brief.',
} as const;

/**
 * Ops Agent. Super Admin and Admin only (the route guard and every database policy check the role).
 * The sections are links in the sidebar; this page shows the one in the address (/agent, /agent/chat, ...).
 */
export default function OpsAgent() {
  const scope = useAgentScope();
  const navigate = useNavigate();
  const splat = useParams()['*'];
  const { toast } = useToast();
  // Any change to the agent's flags refreshes the Inbox; a new high or critical one also shows a toast.
  useAgentFlagsRealtime((f) => toast({ title: f.severity === 'critical' ? 'New critical flag' : 'New high-priority flag', description: f.title }));
  // Memory moved into Settings.
  if ((splat ?? '').split('/')[0] === 'memory') return <Navigate to="/agent/settings/memory" replace />;
  const canConfigure = scope.data?.configure === true;
  const tab = tabFromSplat(splat);
  const meta = AGENT_TABS.find((t) => t.key === tab)!;
  // Connections is for Super Admins only; anyone else who types the address lands on the Inbox.
  const blocked = tab === 'connections' && scope.data && !canConfigure;

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="ops-agent">
      <PageHeader title={tab === 'inbox' ? 'Agent' : `Agent · ${meta.label}`} description={DESCRIPTIONS[tab]} icon={Bot} compact />

      {scope.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : scope.isError || !scope.data?.access ? (
        <p className="text-sm text-destructive" role="alert">You do not have access to the Agent.</p>
      ) : (
        <>
          <AgentBanners canConfigure={canConfigure} onOpenSettings={tab === 'settings' ? undefined : () => navigate('/agent/settings/claude')} />
          {tab === 'inbox' && <InboxTab />}
          {tab === 'chat' && <ChatTab />}
          {tab === 'summaries' && <SummariesTab />}
          {tab === 'connections' && (blocked ? <p className="text-sm text-muted-foreground" role="note">Connections are managed by a Super Admin.</p> : <ConnectionsTab />)}
          {tab === 'settings' && <SettingsTab canConfigure={canConfigure} />}
        </>
      )}
    </div>
  );
}
