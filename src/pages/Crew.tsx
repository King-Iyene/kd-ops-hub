import { useState } from 'react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { ApprovalsTab } from '@/features/crew/components/ApprovalsTab';
import { MessagesTab } from '@/features/crew/components/MessagesTab';
import { OrdersTab } from '@/features/crew/components/OrdersTab';
import { BrainTab } from '@/features/crew/components/BrainTab';
import { IdeasTab } from '@/features/crew/components/IdeasTab';
import { TeamTab } from '@/features/crew/components/TeamTab';
import { useCrewMessages, useCrewProposals } from '@/features/crew/useCrew';

type Tab = 'approvals' | 'messages' | 'orders' | 'ideas' | 'team' | 'brain';

/**
 * Crew: the AI executives. Super Admin only (the route guard and every database policy check the role).
 * They read, advise and propose; nothing they propose changes anything until you approve it here.
 */
export default function Crew() {
  const [tab, setTab] = useState<Tab>('approvals');
  const waiting = useCrewProposals('waiting');
  const messages = useCrewMessages();
  const nWaiting = waiting.data?.length ?? 0;
  const nUnread = (messages.data ?? []).filter((m) => m.to_owner && !m.read_at).length;
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'approvals', label: 'Approvals', badge: nWaiting },
    { key: 'messages', label: 'Messages', badge: nUnread },
    { key: 'orders', label: 'Orders' },
    { key: 'ideas', label: 'Ideas' },
    { key: 'team', label: 'Team' },
    { key: 'brain', label: 'Company brain' },
  ];
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader
        title="Crew"
        icon={Users}
        description="Your CFO, the VP Finance and finance team, and the heads of operations, tasks, people, product, marketing, engineering and NDI. They read, think, advise and propose. Nothing changes until you approve it."
      />
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} size="sm" variant={tab === t.key ? 'default' : 'outline'} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge ? <span className="ml-2 rounded-full bg-background/20 px-1.5 text-[11px]">{t.badge}</span> : null}
          </Button>
        ))}
      </div>
      {tab === 'approvals' ? <ApprovalsTab /> : null}
      {tab === 'messages' ? <MessagesTab /> : null}
      {tab === 'orders' ? <OrdersTab /> : null}
      {tab === 'ideas' ? <IdeasTab /> : null}
      {tab === 'team' ? <TeamTab /> : null}
      {tab === 'brain' ? <BrainTab /> : null}
    </div>
  );
}
