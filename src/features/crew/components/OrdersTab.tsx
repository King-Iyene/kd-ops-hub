import { useState } from 'react';
import { Gavel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CrewOrder, OrderStatus } from '../crewDb';
import { useCrewAgents, useCrewOrders, useGiveOrder, useResolveOrder } from '../useCrew';
import { Empty } from './shared';
import { agentName, ago } from '../helpers';

const TONE: Record<OrderStatus, string> = {
  given: 'bg-muted text-muted-foreground', accepted: 'bg-emerald-500/15 text-emerald-700', challenged: 'bg-red-500/15 text-red-600',
  vetoed: 'bg-muted text-muted-foreground', withdrawn: 'bg-muted text-muted-foreground', done: 'bg-blue-500/15 text-blue-700',
};

function ChallengeBox({ o }: { o: CrewOrder }) {
  const { toast } = useToast();
  const resolve = useResolveOrder();
  const [note, setNote] = useState('');
  const go = (resolution: 'veto' | 'insist' | 'accept_challenge', msg: string) =>
    resolve.mutate({ id: o.id, resolution, note }, { onSuccess: () => toast({ title: msg }), onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }) });
  return (
    <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-red-600"><Gavel className="h-4 w-4" />Challenged</div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{o.challenge}</p>
      <Textarea className="mt-2" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your answer (optional). They write the outcome down and learn from it." />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => go('accept_challenge', 'You agreed with them: the order is withdrawn')} disabled={resolve.isPending}>They are right: drop it</Button>
        <Button size="sm" variant="destructive" onClick={() => go('veto', 'Vetoed: the order is cancelled')} disabled={resolve.isPending}>Veto</Button>
        <Button size="sm" onClick={() => go('insist', 'You insisted: they will comply and note their objection')} disabled={resolve.isPending}>Do it anyway</Button>
      </div>
    </div>
  );
}

export function OrdersTab() {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const orders = useCrewOrders();
  const give = useGiveOrder();
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const send = () => give.mutate({ agentId: to, text }, {
    onSuccess: () => { setText(''); toast({ title: 'Order given', description: 'They may do it, or challenge it with evidence. You decide after.' }); },
    onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
  });
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm text-muted-foreground">An order is different from a chat message: the agent must answer it. It can accept, or challenge it if it would hurt the company. You can then veto it, insist, or accept its argument.</p>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="mb-2 h-9 rounded-md border bg-background px-2 text-sm" aria-label="Who to order">
          <option value="">Choose who…</option>
          {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}: {a.title}</option>)}
        </select>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What must be done?" />
        <Button className="mt-2" size="sm" onClick={send} disabled={!to || text.trim().length < 3 || give.isPending}>Give the order</Button>
      </div>
      {!orders.isLoading && (orders.data ?? []).length === 0 ? <Empty>No orders yet.</Empty> : null}
      <div className="space-y-3">
        {(orders.data ?? []).map((o) => (
          <div key={o.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{agentName(agents.data, o.agent_id)}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE[o.status])}>{o.status}</span>
              <span>{ago(o.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{o.text}</p>
            {o.status === 'challenged' ? <ChallengeBox o={o} /> : null}
            {o.owner_response && o.status !== 'challenged' ? <p className="mt-2 text-xs text-muted-foreground">Your answer: {o.owner_response}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
