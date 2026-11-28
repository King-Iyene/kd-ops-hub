import { useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { agentAvatar } from './world/agents';
import { AvatarFace } from './AvatarFace';
import { useCrewAgents, useCrewPrivate, useCrewProposals, useCrewRuns } from '@/features/crew/useCrew';
import { StatusDot } from '@/features/crew/components/shared';
import { ago } from '@/features/crew/helpers';

const MODELS: Record<string, string> = { 'claude-opus-4-8': 'Opus 4.8', 'claude-sonnet-5-5': 'Sonnet 5.5' };

/** What the owner alone can see about an executive: the brief they work to, how they run, what is waiting on them. */
function OwnerView({ agentId }: { agentId: string }) {
  const priv = useCrewPrivate();
  const runs = useCrewRuns(agentId);
  const waiting = useCrewProposals('waiting');
  const p = priv.data?.find((x) => x.agent_id === agentId);
  const mine = (waiting.data ?? []).filter((x) => x.agent_id === agentId).length;
  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      {p ? (
        <>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Their brief</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{p.persona.length > 520 ? p.persona.slice(0, 520).trimEnd() + '…' : p.persona}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Model</dt><dd>{MODELS[p.model] ?? p.model}</dd>
            <dt className="text-muted-foreground">Runs a day</dt><dd>{p.max_runs_per_day == null ? 'Unlimited' : p.max_runs_per_day}</dd>
            <dt className="text-muted-foreground">Waiting for you</dt><dd>{mine} {mine === 1 ? 'proposal' : 'proposals'}</dd>
            <dt className="text-muted-foreground">Can propose</dt><dd>{p.allowed_actions.length} kinds of change</dd>
          </dl>
        </>
      ) : <p className="text-xs text-muted-foreground">Loading their brief…</p>}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent runs</p>
        {(runs.data ?? []).length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No runs yet.</p> : (
          <ul className="mt-1 space-y-1 text-[13px]">
            {(runs.data ?? []).slice(0, 3).map((r) => (
              <li key={r.id} className="flex gap-2"><span className="shrink-0 text-muted-foreground">{ago(r.started_at)}</span><span className="min-w-0 truncate">{r.ok === false ? 'Failed: ' : ''}{r.summary || 'No summary'}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Click an executive in the Office: who they are and what their job is. Everybody sees the name, title, department, who they report to and who
 * reports to them; the owner also sees their brief, model and recent work, and can message them.
 */
export function AgentProfileDialog({ agentId, isOwner, onClose, onMessage }: { agentId: string | null; isOwner: boolean; onClose: () => void; onMessage: (id: string) => void }) {
  const agents = useCrewAgents();
  const agent = agents.data?.find((a) => a.id === agentId) ?? null;
  const manager = agents.data?.find((a) => a.id === agent?.reports_to) ?? null;
  const reports = useMemo(() => (agents.data ?? []).filter((a) => a.reports_to === agentId), [agents.data, agentId]);
  const first = agent?.name.split(' ')[0] ?? '';
  return (
    <Dialog open={!!agent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-md">
        {agent ? (
          <>
            <div className="flex items-center gap-4">
              <AvatarFace avatar={agentAvatar(agent)} size={72} />
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg">{agent.name}</DialogTitle>
                <DialogDescription className="truncate">{agent.title}</DialogDescription>
                <div className="mt-1"><StatusDot status={agent.status} /></div>
              </div>
            </div>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted-foreground">Department</dt><dd>{agent.department}</dd>
              <dt className="text-muted-foreground">Works for</dt><dd>{agent.company}</dd>
              <dt className="text-muted-foreground">Reports to</dt><dd>{manager ? `${manager.name} (${manager.title})` : 'The owner'}</dd>
              {reports.length > 0 ? (<><dt className="text-muted-foreground">Manages</dt><dd>{reports.map((r) => r.name.split(' ')[0]).join(', ')}</dd></>) : null}
              {agent.activity ? (<><dt className="text-muted-foreground">Doing now</dt><dd>{agent.activity}</dd></>) : null}
              {agent.last_seen_at ? (<><dt className="text-muted-foreground">Last active</dt><dd>{ago(agent.last_seen_at)}</dd></>) : null}
            </dl>
            <p className="text-xs text-muted-foreground">An AI executive. Everything {first} proposes waits for the owner to approve it.</p>
            {isOwner ? <OwnerView agentId={agent.id} /> : null}
            {isOwner ? (
              <div className="flex justify-end gap-2 pt-1">
                <Button onClick={() => onMessage(agent.id)}><MessageSquare className="mr-1.5 h-4 w-4" />Message {first}</Button>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
