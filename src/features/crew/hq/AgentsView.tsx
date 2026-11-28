// AGENTS: the team as cards, with who reports to whom drawn as a small tree, and a search. A card opens the profile drawer.
import { useMemo, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import type { CrewAgent } from '../crewDb';
import { ago } from '../helpers';
import { buildOrgTree, type OrgNode } from '../orgChart';
import { useLatestRuns } from './hooks';
import { usePausedIds } from './pause';
import { Btn, Chip, EmptyState, Eyebrow, Face, HqCard, LoadingRows, StatusLine } from './ui';
import type { HqData } from './useHq';

function Branch({ node, onOpen, paused, depth }: { node: OrgNode; onOpen: (a: CrewAgent) => void; paused: ReadonlySet<string>; depth: number }) {
  return (
    <li className="relative">
      <button type="button" onClick={() => onOpen(node.agent)} className="hq-focus inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-semibold transition hover:border-[hsl(var(--hq-signal)/0.5)]">
        <Face agent={node.agent} size={24} paused={paused.has(node.agent.id)} />
        <span>{node.agent.name.split(' ')[0]}</span><span className="hidden text-xs font-normal text-muted-foreground sm:inline">{node.agent.title}</span>
      </button>
      {node.reports.length ? (
        <ul className={`ml-5 mt-2 space-y-2 border-l border-border pl-4 ${depth > 2 ? 'ml-3 pl-3' : ''}`}>
          {node.reports.map((r) => <Branch key={r.agent.id} node={r} onOpen={onOpen} paused={paused} depth={depth + 1} />)}
        </ul>
      ) : null}
    </li>
  );
}

export function AgentsView({ data, onOpen }: { data: HqData; onOpen: (a: CrewAgent, tab?: 'messages') => void }) {
  const paused = usePausedIds();
  const runs = useLatestRuns();
  const [q, setQ] = useState('');
  const tree = useMemo(() => buildOrgTree(data.agents), [data.agents]);
  const needle = q.trim().toLowerCase();
  const shown = data.agents.filter((a) => !needle || [a.name, a.title, a.department, a.role, a.activity].some((x) => (x ?? '').toLowerCase().includes(needle)));
  if (data.loading) return <LoadingRows rows={3} label="Loading the team" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <HqCard flat className="h-fit p-4">
          <Eyebrow>Who reports to whom</Eyebrow>
          <ul className="mt-3 space-y-2">
            <li><span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--hq-signal)/0.13)] px-3 py-1.5 text-sm font-bold text-[hsl(var(--hq-signal-ink))]">You, the owner</span>
              <ul className="ml-5 mt-2 space-y-2 border-l border-border pl-4">{tree.map((n) => <Branch key={n.agent.id} node={n} onOpen={onOpen} paused={paused} depth={1} />)}</ul>
            </li>
          </ul>
        </HqCard>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the team" placeholder="Search a name, or a job like payroll, tax, hiring…" className="hq-focus h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm" />
          </div>
          {shown.length === 0 ? <EmptyState title="No one matches">Try a different word.</EmptyState> : (
            <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {shown.map((a) => {
                const isPaused = paused.has(a.id);
                const boss = data.byId.get(a.reports_to ?? '');
                const leads = data.agents.filter((x) => x.reports_to === a.id);
                const last = runs.byAgent.get(a.id) ?? a.last_seen_at;
                return (
                  <li key={a.id}>
                    <HqCard interactive risk="none" className={`flex h-full flex-col gap-3 p-4 ${isPaused ? 'opacity-80' : ''}`}>
                      <button type="button" onClick={() => onOpen(a)} className="hq-focus flex min-w-0 items-center gap-3 rounded-xl text-left" aria-label={`Open ${a.name}'s profile`}>
                        <Face agent={a} size={52} paused={isPaused} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{a.name}</span><span className="block truncate text-xs text-muted-foreground">{a.title}</span><span className="mt-1 block"><StatusLine agent={a} paused={isPaused} /></span></span>
                      </button>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Chip>{a.department}</Chip>
                        <span>Reports to</span>{boss ? <Chip>{boss.name.split(' ')[0]}</Chip> : <Chip tone="signal">You</Chip>}
                        {leads.length ? <><span>· Leads</span>{leads.slice(0, 3).map((l) => <Chip key={l.id}>{l.name.split(' ')[0]}</Chip>)}{leads.length > 3 ? <span>+{leads.length - 3}</span> : null}</> : null}
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{last ? `Last run ${ago(last)}` : 'No runs yet'}</span>
                        <Btn tone="soft" className="min-h-8 px-3 py-1" onClick={() => onOpen(a, 'messages')}><MessageSquare className="h-3.5 w-3.5" />Message</Btn>
                      </div>
                      {isPaused ? <p className="text-xs font-semibold text-[hsl(var(--hq-warn))]">Paused: will read messages when resumed</p> : null}
                    </HqCard>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
