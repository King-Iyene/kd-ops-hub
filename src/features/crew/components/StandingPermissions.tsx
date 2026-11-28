import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { CliqConnection, CliqPostLogRow, CrewAgent, PostKindKey, StandingPermission } from '../crewDb';
import { ago, standingSentence } from '../helpers';
import { useCliqConnections, useCliqPostLog, useCrewAgents, useSetStandingPermission, useStandingKillAll, useStandingPermissions } from '../useCrew';

const KINDS: { key: PostKindKey; label: string }[] = [
  { key: 'tracking_followup', label: 'Tracking follow-ups' },
  { key: 'announcement', label: 'Announcements' },
];
const STATUS_TEXT: Record<CliqPostLogRow['status'], string> = { sent: 'Posted', failed: 'Could not post', refused: 'Refused by the rules', reserved: 'Posting' };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function Row({ perm, agent, connections }: { perm: StandingPermission; agent: CrewAgent | undefined; connections: CliqConnection[] }) {
  const { toast } = useToast();
  const save = useSetStandingPermission();
  const [enabled, setEnabled] = useState(perm.enabled);
  const [connection, setConnection] = useState(perm.connection_id ?? '');
  const [max, setMax] = useState(String(perm.max_posts_per_day));
  const [kinds, setKinds] = useState<PostKindKey[]>(perm.allowed_kinds);
  // When the saved permission changes (a save, or the kill switch), the card shows what is now true.
  useEffect(() => {
    setEnabled(perm.enabled); setConnection(perm.connection_id ?? ''); setMax(String(perm.max_posts_per_day)); setKinds(perm.allowed_kinds);
  }, [perm.enabled, perm.connection_id, perm.max_posts_per_day, perm.allowed_kinds]);

  const first = agent ? firstName(agent.name) : 'This agent';
  const channels = connections.filter((c) => c.config.mode === 'api' && !!c.config.channel);
  const chosen = channels.find((c) => c.id === connection);
  const cap = Number(max);
  const capOk = Number.isInteger(cap) && cap >= 1 && cap <= 20;
  const valid = capOk && kinds.length > 0 && (!enabled || connection !== '');
  const dirty = enabled !== perm.enabled || connection !== (perm.connection_id ?? '') || cap !== perm.max_posts_per_day || [...kinds].sort().join() !== [...perm.allowed_kinds].sort().join();
  const toggleKind = (k: PostKindKey) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{agent ? `${agent.name}, ${agent.title}` : 'An agent'}</div>
          <div className="text-xs text-muted-foreground">{perm.enabled ? 'On: they may post as set below.' : `Off: ${first} cannot post anything.`}</div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} aria-label={`Allow ${first} to post in Cliq`} />
          Allowed
        </label>
      </div>
      <p className="mb-3 text-xs" data-testid="standing-sentence">{standingSentence({ first, channel: chosen?.config.channel ?? null, max: capOk ? cap : perm.max_posts_per_day, kinds })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          Channel
          <select value={connection} onChange={(e) => setConnection(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Choose the channel…</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.config.channel})</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium">
          Most posts a day (1 to 20)
          <input type="number" min={1} max={20} value={max} onChange={(e) => setMax(e.target.value)} aria-invalid={!capOk} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {KINDS.map((k) => (
          <label key={k.key} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={kinds.includes(k.key)} onChange={() => toggleKind(k.key)} />{k.label}
          </label>
        ))}
      </div>
      {chosen && chosen.status && chosen.status !== 'connected' && (
        <p role="alert" className="mt-2 text-xs text-destructive">That connection shows as {chosen.status}: open Agent &gt; Connections and press Reconnect to Zoho before switching this on, or the posts will fail.</p>
      )}
      {!capOk && <p role="alert" className="mt-2 text-xs text-destructive">The daily limit is a whole number from 1 to 20.</p>}
      {enabled && connection === '' && <p role="alert" className="mt-2 text-xs text-destructive">Choose the channel first.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Fixed rules, whatever is switched on: 700 characters at most; no links except kdsquares.com; no money amounts, emails, phone or account numbers or secrets; one tracking reminder per person per day; people are tagged only if they have a Cliq id in Agent &gt; Settings &gt; Team.</p>
      <div className="mt-3">
        <Button size="sm" disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate({ agent: perm.agent_id, connection: connection || null, enabled, max: cap, kinds }, {
          onSuccess: () => toast({ title: enabled ? `Saved: ${first} may post in Cliq as set` : `Saved: ${first} cannot post in Cliq` }),
          onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
        })}>Save</Button>
      </div>
    </div>
  );
}

/**
 * What an agent may do on its own, inside limits you set. Today: the Head of Operations posting follow-ups and announcements to the team in a Cliq channel.
 * Off until you switch it on; the kill switch turns every one of these off at once. Everything posted (and everything refused) is logged here.
 */
export function StandingPermissions() {
  const { toast } = useToast();
  const perms = useStandingPermissions();
  const agents = useCrewAgents();
  const connections = useCliqConnections();
  const log = useCliqPostLog();
  const kill = useStandingKillAll();
  const byId = new Map((agents.data ?? []).map((a) => [a.id, a]));
  const rows = perms.data ?? [];
  const anyOn = rows.some((p) => p.enabled);
  // Nothing here for anyone who is not the owner (the database returns no rows): the card stays quiet.
  if (perms.isLoading || perms.isError) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-sm font-medium">Standing permissions</div>
        <Button size="sm" variant="destructive" disabled={!anyOn || kill.isPending} onClick={() => kill.mutate(undefined, {
          onSuccess: (n) => toast({ title: `Switched off: ${typeof n === 'number' ? n : 'all'} standing permission${n === 1 ? '' : 's'}` }),
          onError: (e) => toast({ title: 'Could not switch off', description: e.message, variant: 'destructive' }),
        })}>Switch everything off now</Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Some agents may act on their own inside strict limits you set, so you do not have to approve each message. Nothing is on until you switch it on. You can switch one off at any time, or everything at once.</p>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">No standing permissions are set up yet.</p> : (
        <div className="space-y-3">{rows.map((p) => <Row key={p.id} perm={p} agent={byId.get(p.agent_id)} connections={connections.data ?? []} />)}</div>
      )}
      <div className="mt-4 text-xs font-medium">Posted so far</div>
      {(log.data ?? []).length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Nothing yet.</p> : (
        <ul className="mt-2 space-y-2" aria-label="Posts agents made under a standing permission">
          {(log.data ?? []).map((r) => (
            <li key={r.id} className="rounded-md border p-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <span className="font-medium text-foreground">{byId.has(r.agent_id) ? firstName(byId.get(r.agent_id)!.name) : 'Agent'}</span>
                <span>{r.kind === 'tracking_followup' ? 'follow-up' : r.kind === 'announcement' ? 'announcement' : r.kind}</span>
                <span className={r.status === 'sent' ? '' : r.status === 'reserved' ? '' : 'text-destructive'}>{STATUS_TEXT[r.status]}</span>
                <span>{ago(r.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
              {r.tagged.length > 0 && <p className="mt-1 text-muted-foreground">Named: {r.tagged.map((t) => (t.tagged ? t.name : `${t.name} (no Cliq id: plain name)`)).join(', ')}</p>}
              {r.error && <p className="mt-1 text-destructive">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
