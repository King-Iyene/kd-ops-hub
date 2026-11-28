import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { CrewAgent, CrewProposal } from '../crewDb';
import { useCrewAgents, useCrewProposals, useDecideProposal, useMarkDone } from '../useCrew';
import { approveLabel, describeAction, riskOrder } from '../orgChart';
import { Avatar, Empty, RiskBadge } from './shared';
import { agentName, ago } from '../helpers';

type Group = 'waiting' | 'carry_out' | 'history';
const GROUPS: { key: Group; label: string }[] = [
  { key: 'waiting', label: 'Waiting for you' },
  { key: 'carry_out', label: 'Approved: to carry out' },
  { key: 'history', label: 'History' },
];

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

function ProposalCard({ p, agents, group }: { p: CrewProposal; agents: CrewAgent[] | undefined; group: Group }) {
  const { toast } = useToast();
  const decide = useDecideProposal();
  const done = useMarkDone();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const agent = agents?.find((a) => a.id === p.agent_id);

  const onApprove = () => decide.mutate({ id: p.id, decision: 'approve' }, {
    onSuccess: (r) => (r.status === 'failed'
      ? toast({ title: 'It could not be applied', description: r.error ?? 'The database refused it. Nothing was changed.', variant: 'destructive' })
      : toast({ title: p.action.startsWith('record.') ? 'Applied' : 'Approved' })),
    onError: (e) => toast({ title: 'Not approved', description: e.message, variant: 'destructive' }),
  });
  const onReject = () => decide.mutate({ id: p.id, decision: 'reject', note }, {
    onSuccess: () => { toast({ title: 'Rejected', description: note.trim() ? 'The agent will learn from your reason.' : 'No reason given: the agent will ask before proposing it again.' }); setRejecting(false); setNote(''); },
    onError: (e) => toast({ title: 'Not rejected', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        {agent ? <Avatar agent={agent} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{agentName(agents, p.agent_id)}</span>
            <span>{agent?.title}</span>
            <span>· {ago(p.created_at)}</span>
            {p.remind_count > 0 && group === 'waiting' ? <span className="text-amber-600">· reminded {p.remind_count}×</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{describeAction(p.action)}</span>
            <RiskBadge risk={p.risk} />
            {p.requires_approver === 'manager_or_owner' && p.status === 'pending' ? <span className="text-xs text-muted-foreground">low risk: the CFO may clear it</span> : null}
          </div>
          <p className="mt-2 text-sm font-medium">{p.summary}</p>
          {p.rationale ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{p.rationale}</p> : null}

          {p.endorsements.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs">
              {p.endorsements.map((e, i) => (
                <li key={i} className={e.stance === 'oppose' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}>
                  {agentName(agents, e.agent)} {e.stance === 'oppose' ? 'advises against' : 'supports'}{e.note ? `: ${e.note}` : ''}
                </li>
              ))}
            </ul>
          ) : null}

          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Evidence and exact change
          </button>
          {open ? (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div><div className="mb-1 text-xs font-medium">Evidence</div><Json value={p.evidence} /></div>
              <div><div className="mb-1 text-xs font-medium">What it will do</div><Json value={p.payload} /></div>
            </div>
          ) : null}

          {p.decision_note ? <p className="mt-2 text-xs text-muted-foreground">Your note: {p.decision_note}</p> : null}
          {p.error ? <p className="mt-2 text-xs text-red-600">Could not be applied: {p.error}</p> : null}

          {group === 'waiting' ? (
            <div className="mt-3">
              {rejecting ? (
                <div className="space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (the agent writes this down and learns from it)" rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={onReject} disabled={decide.isPending}>Reject</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={onApprove} disabled={decide.isPending}><Check className="mr-1 h-4 w-4" />{approveLabel(p.action)}</Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={decide.isPending}><X className="mr-1 h-4 w-4" />Reject</Button>
                </div>
              )}
            </div>
          ) : null}

          {group === 'carry_out' ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {p.action.startsWith('draft.') ? 'The agent carries this out with its own tools, then reports it done.' : 'Carry this out yourself (or ask Claude), then mark it done.'}
              </span>
              {!p.action.startsWith('draft.') ? (
                <Button size="sm" variant="outline" disabled={done.isPending} onClick={() => done.mutate({ id: p.id }, { onSuccess: () => toast({ title: 'Marked done' }), onError: (e) => toast({ title: 'Could not mark it', description: e.message, variant: 'destructive' }) })}>
                  Mark done
                </Button>
              ) : null}
            </div>
          ) : null}

          {group === 'history' ? <p className="mt-2 text-xs text-muted-foreground">{p.status}{p.decided_at ? ` · ${ago(p.decided_at)}` : ''}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function ApprovalsTab() {
  const [group, setGroup] = useState<Group>('waiting');
  const agents = useCrewAgents();
  const list = useCrewProposals(group);
  const sorted = [...(list.data ?? [])].sort((a, b) => (group === 'waiting' ? riskOrder(a.risk) - riskOrder(b.risk) || a.created_at.localeCompare(b.created_at) : 0));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <Button key={g.key} size="sm" variant={group === g.key ? 'default' : 'outline'} onClick={() => setGroup(g.key)}>{g.label}</Button>
        ))}
      </div>
      {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {list.error ? <p className="text-sm text-red-600">{list.error.message}</p> : null}
      {!list.isLoading && sorted.length === 0 ? (
        <Empty>{group === 'waiting' ? 'Nothing is waiting for you. The agents propose; you decide.' : group === 'carry_out' ? 'Nothing approved is waiting to be carried out.' : 'No decisions yet.'}</Empty>
      ) : null}
      <div className="space-y-3">{sorted.map((p) => <ProposalCard key={p.id} p={p} agents={agents.data} group={group} />)}</div>
    </div>
  );
}
