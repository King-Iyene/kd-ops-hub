import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CrewIdea, IdeaStatus } from '../crewDb';
import { useAddIdea, useCrewAgents, useCrewIdeas, useDecideIdea } from '../useCrew';
import { agentName, ago } from '../helpers';
import { Empty } from './shared';

type Group = 'new' | 'approved' | 'done';
const GROUPS: { key: Group; label: string; statuses: IdeaStatus[] }[] = [
  { key: 'new', label: 'To decide', statuses: ['open', 'triaged'] },
  { key: 'approved', label: 'Approved and building', statuses: ['approved', 'building'] },
  { key: 'done', label: 'Shipped and rejected', statuses: ['shipped', 'rejected'] },
];

const PRIORITY_TONE: Record<string, string> = { high: 'bg-red-500/15 text-red-600', medium: 'bg-amber-500/15 text-amber-700', low: 'bg-muted text-muted-foreground' };

function IdeaCard({ idea }: { idea: CrewIdea }) {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const decide = useDecideIdea();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const go = (decision: 'approve' | 'reject' | 'building' | 'shipped', done: string) =>
    decide.mutate({ id: idea.id, decision, note }, { onSuccess: () => { setNote(''); toast({ title: done }); }, onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }) });
  const final = idea.status === 'shipped' || idea.status === 'rejected';
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium uppercase', PRIORITY_TONE[idea.priority])}>{idea.priority}</span>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">{idea.status}</span>
        <span>{idea.support_count} need{idea.support_count === 1 ? 's' : ''} it</span>
        {idea.departments.length > 0 ? <span>· {idea.departments.join(', ')}</span> : null}
        <span>· {idea.requested_by ? agentName(agents.data, idea.requested_by) : 'You'} · {ago(idea.created_at)}</span>
        {idea.estimate ? <span>· estimate: {idea.estimate}</span> : null}
      </div>
      <h3 className="mt-1 text-sm font-semibold">{idea.title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{idea.problem}</p>
      {idea.proposal ? <p className="mt-2 whitespace-pre-wrap text-sm"><span className="font-medium">Build: </span>{idea.proposal}</p> : null}
      {(idea.supporters.length > 1 || idea.spec) ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-xs text-muted-foreground underline">{open ? 'Hide' : 'Show'} who needs it{idea.spec ? ' and the spec' : ''}</button>
      ) : null}
      {open ? (
        <div className="mt-2 space-y-2 text-xs">
          {idea.supporters.map((s, i) => <p key={i}><span className="font-medium">{agentName(agents.data, s.agent)}</span> ({s.department}): {s.note}</p>)}
          {idea.spec ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3">{idea.spec}</pre> : null}
        </div>
      ) : null}
      {idea.owner_note ? <p className="mt-2 text-xs text-muted-foreground">Your note: {idea.owner_note}</p> : null}
      {!final ? (
        <div className="mt-3 space-y-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note (a reason when you reject: the agents learn from it)" />
          <div className="flex flex-wrap gap-2">
            {idea.status === 'open' || idea.status === 'triaged' ? <Button size="sm" disabled={decide.isPending} onClick={() => go('approve', 'Approved: Engineering writes the spec and proposes the build')}>Approve</Button> : null}
            {idea.status === 'approved' ? <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => go('building', 'Marked as being built')}>Mark building</Button> : null}
            {idea.status === 'approved' || idea.status === 'building' ? <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => go('shipped', 'Marked as shipped: everyone who asked is told')}>Mark shipped</Button> : null}
            <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => go('reject', 'Rejected: the agents who asked will learn from it')}>Reject</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddIdea() {
  const { toast } = useToast();
  const add = useAddIdea();
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [proposal, setProposal] = useState('');
  const valid = title.trim().length >= 5 && problem.trim().length >= 10;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 text-sm font-medium">Something you want built</div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" className="mb-2" />
      <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} placeholder="What is the problem, or what do you want to happen?" className="mb-2" />
      <Textarea value={proposal} onChange={(e) => setProposal(e.target.value)} rows={2} placeholder="How you imagine it (optional)" />
      <Button className="mt-2" size="sm" disabled={!valid || add.isPending} onClick={() => add.mutate({ title, problem, proposal }, {
        onSuccess: () => { setTitle(''); setProblem(''); setProposal(''); toast({ title: 'Added as approved', description: 'The Head of Engineering is told to spec it and propose the build.' }); },
        onError: (e) => toast({ title: 'Not added', description: e.message, variant: 'destructive' }),
      })}>Add (counts as approved)</Button>
    </div>
  );
}

export function IdeasTab() {
  const [group, setGroup] = useState<Group>('new');
  const ideas = useCrewIdeas();
  const g = GROUPS.find((x) => x.key === group)!;
  const list = (ideas.data ?? []).filter((i) => g.statuses.includes(i.status));
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />The agents file ideas when they see a job done by hand again and again. Similar ideas are joined, so you can see how many departments need the same thing. Engineering ranks and specs them. Nothing is built until you approve.</p>
      <AddIdea />
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((x) => <Button key={x.key} size="sm" variant={group === x.key ? 'default' : 'outline'} onClick={() => setGroup(x.key)}>{x.label}{(ideas.data ?? []).filter((i) => x.statuses.includes(i.status)).length ? ` (${(ideas.data ?? []).filter((i) => x.statuses.includes(i.status)).length})` : ''}</Button>)}
      </div>
      {ideas.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!ideas.isLoading && list.length === 0 ? <Empty>Nothing here yet.</Empty> : null}
      <div className="space-y-3">{list.map((i) => <IdeaCard key={i.id} idea={i} />)}</div>
    </div>
  );
}
