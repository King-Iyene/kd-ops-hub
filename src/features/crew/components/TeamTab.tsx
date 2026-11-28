import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CrewAgent } from '../crewDb';
import { useCrewAgents, useCrewNotes, useCrewPrivate, useCrewRuns, useIssueToken, useRetireNote, useRevokeTokens } from '../useCrew';
import { buildOrgTree, type OrgNode } from '../orgChart';
import { Avatar, StatusDot } from './shared';
import { CliqSettings } from './CliqSettings';
import { ago } from '../helpers';

function Node({ node, selected, onSelect, depth }: { node: OrgNode; selected: string | null; onSelect: (a: CrewAgent) => void; depth: number }) {
  const a = node.agent;
  return (
    <li>
      <button type="button" onClick={() => onSelect(a)} className={cn('flex w-full items-center gap-3 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/50', selected === a.id && 'border-primary bg-primary/5')}>
        <Avatar agent={a} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{a.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{a.title}</span>
        </span>
        <span className="hidden shrink-0 sm:block"><StatusDot status={a.status} /></span>
      </button>
      {node.reports.length > 0 ? (
        <ul className={cn('ml-4 mt-2 space-y-2 border-l pl-4', depth > 2 && 'ml-2 pl-2')}>
          {node.reports.map((c) => <Node key={c.agent.id} node={c} selected={selected} onSelect={onSelect} depth={depth + 1} />)}
        </ul>
      ) : null}
    </li>
  );
}

function Detail({ agent }: { agent: CrewAgent }) {
  const { toast } = useToast();
  const priv = useCrewPrivate();
  const notes = useCrewNotes(agent.id);
  const runs = useCrewRuns(agent.id);
  const retire = useRetireNote();
  const issue = useIssueToken();
  const revoke = useRevokeTokens();
  const [token, setToken] = useState<string | null>(null);
  const p = priv.data?.find((x) => x.agent_id === agent.id);

  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast({ title: 'Copied' }); } catch { toast({ title: 'Could not copy: select it by hand', variant: 'destructive' }); } };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar agent={agent} size={48} />
        <div>
          <div className="text-base font-semibold">{agent.name}</div>
          <div className="text-sm text-muted-foreground">{agent.title} · {agent.department}</div>
          <StatusDot status={agent.status} />
          {agent.activity ? <span className="ml-2 text-xs text-muted-foreground">{agent.activity}</span> : null}
        </div>
      </div>
      {p ? (
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Brain</div>{p.model}{p.advisor_model ? ` (advisor ${p.advisor_model})` : ''}</div>
          <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Runs per day</div>{p.max_runs_per_day === null ? "No limit" : p.max_runs_per_day}</div>
          <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Last seen</div>{ago(agent.last_seen_at)}</div>
        </div>
      ) : null}
      {p ? (
        <div>
          <div className="mb-1 text-xs font-medium">What it may propose</div>
          <div className="flex flex-wrap gap-1">{p.allowed_actions.map((x) => <span key={x} className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{x}</span>)}</div>
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs text-muted-foreground">Character and instructions</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{p.persona}</p>
            <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{p.instructions}</p>
          </details>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-xs font-medium">What it has learned ({notes.data?.length ?? 0})</div>
        {(notes.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Nothing yet. It writes a lesson after each rejection, challenge or failure.</p> : null}
        <ul className="space-y-1">
          {(notes.data ?? []).slice(0, 15).map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-md bg-muted p-2 text-xs">
              <span className="min-w-0 flex-1"><span className="mr-1 font-medium">{n.kind}</span>{n.body}</span>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => retire.mutate(n.id, { onError: (e) => toast({ title: 'Not retired', description: e.message, variant: 'destructive' }) })}>Retire</button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium">Recent runs</div>
        {(runs.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">It has not run yet.</p> : null}
        <ul className="space-y-1 text-xs">
          {(runs.data ?? []).map((r) => (
            <li key={r.id} className="flex gap-2"><span className={r.ok === false ? 'text-red-600' : r.ok ? 'text-emerald-600' : 'text-muted-foreground'}>{r.ok === false ? 'failed' : r.ok ? 'ok' : 'open'}</span><span className="text-muted-foreground">{ago(r.started_at)}</span><span className="truncate">{r.summary}</span></li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-dashed p-3">
        <div className="mb-1 flex items-center gap-1 text-xs font-medium"><KeyRound className="h-3.5 w-3.5" />Access token for this agent's routine</div>
        <p className="mb-2 text-xs text-muted-foreground">The agent's scheduled session uses this to reach the gateway. It can only read what it is allowed to read and put proposals in your queue. Shown once; if you lose it, make a new one and cancel the old.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={issue.isPending} onClick={() => issue.mutate({ slug: agent.slug, label: 'routine' }, { onSuccess: (t) => setToken(t), onError: (e) => toast({ title: 'No token', description: e.message, variant: 'destructive' }) })}>Make a token</Button>
          <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(agent.slug, { onSuccess: (n) => { setToken(null); toast({ title: n > 0 ? `Cancelled ${n} token${n === 1 ? '' : 's'}` : 'No active tokens' }); }, onError: (e) => toast({ title: 'Not cancelled', description: e.message, variant: 'destructive' }) })}>Cancel all tokens</Button>
        </div>
        {token ? (
          <div className="mt-2 flex items-center gap-2 rounded bg-muted p-2">
            <code className="min-w-0 flex-1 break-all text-xs">{token}</code>
            <Button size="icon" variant="ghost" onClick={() => copy(token)} aria-label="Copy token"><Copy className="h-4 w-4" /></Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TeamTab() {
  const agents = useCrewAgents();
  const [selected, setSelected] = useState<CrewAgent | null>(null);
  const tree = buildOrgTree(agents.data ?? []);
  const current = selected ? agents.data?.find((a) => a.id === selected.id) ?? selected : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">You</span>
          <span><span className="block text-sm font-medium">The owner</span><span className="block text-xs text-muted-foreground">Everyone reports up to you. Only you can prompt them and approve.</span></span>
        </div>
        {agents.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <ul className="ml-4 space-y-2 border-l pl-4">
          {tree.map((n) => <Node key={n.agent.id} node={n} selected={current?.id ?? null} onSelect={setSelected} depth={1} />)}
        </ul>
      </div>
      <div className="space-y-6">{current ? <Detail agent={current} /> : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Choose someone to see what they may do, what they have learned and how their last runs went.</div>}<CliqSettings /></div>
    </div>
  );
}
