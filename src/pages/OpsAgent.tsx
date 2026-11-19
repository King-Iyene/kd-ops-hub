import { useSearchParams } from 'react-router-dom';
import { Bot, Brain, Inbox, Link2, MessageSquare, ScrollText, Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentScope } from '@/queries/useOpsAgent';
import { AgentBanners } from '@/features/ops-agent/AgentBanners';
import { InboxTab } from '@/features/ops-agent/tabs/InboxTab';
import { SummariesTab } from '@/features/ops-agent/tabs/SummariesTab';
import { ChatTab } from '@/features/ops-agent/tabs/ChatTab';
import { MemoryTab } from '@/features/ops-agent/tabs/MemoryTab';
import { ConnectionsTab } from '@/features/ops-agent/tabs/ConnectionsTab';
import { SettingsTab } from '@/features/ops-agent/settings/SettingsTab';

const TABS = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'summaries', label: 'Summaries', icon: ScrollText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'memory', label: 'Memory', icon: Brain },
  { key: 'connections', label: 'Connections', icon: Link2, superOnly: true },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

/**
 * Ops Agent. Super Admin and Admin only (the route guard and every database policy check the role).
 * The agent reads business data and writes only its own tables; nothing it finds changes a record.
 */
export default function OpsAgent() {
  const scope = useAgentScope();
  const [params, setParams] = useSearchParams();
  const canConfigure = scope.data?.configure === true;
  const visible = TABS.filter((t) => !('superOnly' in t && t.superOnly) || canConfigure);
  const requested = params.get('tab');
  const active = visible.some((t) => t.key === requested) ? (requested as string) : 'inbox';

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="ops-agent">
      <PageHeader
        title="Ops Agent"
        description="Watches tasks, time and daily reports against the Operating Rules, and tells you who needs a nudge. It reads data and drafts messages. It never changes a record and never sends anything by itself."
        icon={Bot}
      />

      {scope.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : scope.isError || !scope.data?.access ? (
        <p className="text-sm text-destructive" role="alert">You do not have access to the Ops Agent.</p>
      ) : (
        <>
          <AgentBanners canConfigure={canConfigure} onOpenSettings={() => setParams({ tab: 'settings' })} />
          <Tabs value={active} onValueChange={(v) => setParams(v === 'inbox' ? {} : { tab: v })}>
            <TabsList className="h-auto flex-wrap justify-start">
              {visible.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="gap-1.5" data-testid={`agent-tab-${key}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="inbox" className="mt-4"><InboxTab /></TabsContent>
            <TabsContent value="summaries" className="mt-4"><SummariesTab /></TabsContent>
            <TabsContent value="chat" className="mt-4"><ChatTab /></TabsContent>
            <TabsContent value="memory" className="mt-4"><MemoryTab /></TabsContent>
            {canConfigure && <TabsContent value="connections" className="mt-4"><ConnectionsTab /></TabsContent>}
            <TabsContent value="settings" className="mt-4"><SettingsTab canConfigure={canConfigure} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
