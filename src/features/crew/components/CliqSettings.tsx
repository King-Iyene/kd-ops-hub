import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import type { MessageKind } from '../crewDb';
import { useCliqConnections, useCliqOwnerLink, useCrewSettings, useSaveCrewSettings } from '../useCrew';

const KINDS: { key: MessageKind; label: string }[] = [
  { key: 'challenge', label: 'Challenges to your orders' },
  { key: 'alert', label: 'Alerts and problems' },
  { key: 'reminder', label: 'Reminders' },
  { key: 'report', label: 'Reports' },
  { key: 'brief', label: 'Briefings' },
  { key: 'message', label: 'Every message' },
];

/** The same rule the database applies to the Cliq account that may give commands (and that a direct message is sent to). */
const CLIQ_ID = /^[A-Za-z0-9._@+-]{2,120}$/;

/**
 * Where an agent's message to you is also sent in Zoho Cliq: as a direct message to you, or in a channel where you are tagged. It uses the Cliq
 * connections already set up for the Ops Agent (they hold the Zoho sign-in). Off until you turn it on. Saving only happens from the button.
 */
export function CliqSettings() {
  const { toast } = useToast();
  const me = useAuthStore((s) => s.profile?.id ?? null);
  const settings = useCrewSettings();
  const connections = useCliqConnections();
  const save = useSaveCrewSettings();
  // The Ops Agent already knows how to tag people: it uses the Cliq id saved for each person in Agent > Settings > Team. The owner's own id comes from there.
  const link = useCliqOwnerLink();
  const linked = link.data?.linked ?? false;
  const [enabled, setEnabled] = useState(false);
  const [dm, setDm] = useState(false);
  const [connection, setConnection] = useState('');
  const [kinds, setKinds] = useState<string[]>(['alert', 'challenge', 'reminder']);
  const [commands, setCommands] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!settings.data || loaded) return;
    setEnabled(settings.data.cliq_enabled);
    setDm(settings.data.cliq_dm ?? false);
    setConnection(settings.data.cliq_connection_id ?? '');
    setKinds(settings.data.notify_kinds);
    setCommands(settings.data.cliq_commands_enabled ?? false);
    setOwnerId(settings.data.cliq_owner_id ?? '');
    setLoaded(true);
  }, [settings.data, loaded]);

  const toggleKind = (k: string) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const ownerTrim = ownerId.trim();
  const ownerBad = ownerTrim !== '' && !CLIQ_ID.test(ownerTrim);
  // His Cliq account is known when his profile is linked in the Ops Agent, or when he typed one here (which then overrides the linked one).
  const idKnown = CLIQ_ID.test(ownerTrim) || linked;
  // A direct message needs the Zoho sign-in (the connection that signs in with Zoho) and to know who it is for; a channel needs only the connection.
  const dmOk = !dm || !enabled || (connection !== '' && idKnown);
  // Commands share the alerts' destination, and only his own Cliq account is obeyed, so all three must be set before they can be on.
  const commandsOk = !commands || (enabled && connection !== '' && idKnown);
  const valid = kinds.length > 0 && (!enabled || connection !== '') && !ownerBad && commandsOk && dmOk;
  // Sent only when changed, so saving the alerts alone never depends on the newer parts.
  const savedCommands = settings.data?.cliq_commands_enabled ?? false;
  const savedOwner = settings.data?.cliq_owner_id ?? '';
  const savedDm = settings.data?.cliq_dm ?? false;
  const commandsChanged = commands !== savedCommands || ownerTrim !== savedOwner;
  const dmChanged = dm !== savedDm;
  // A direct message can only use the connection that signs in with Zoho (API); a channel can use any of them, as before.
  const list = (connections.data ?? []).filter((c) => !dm || c.config.mode === 'api');
  const connectionName = (connections.data ?? []).find((c) => c.id === connection)?.name ?? '';
  const problem = settings.data?.cliq_error ?? null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 text-sm font-medium">Cliq alerts</div>
      <ul className="mb-3 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground" data-testid="cliq-intro">
        <li>Messages go out through a Zoho sign-in the Ops Agent already has. Today those are signed in as a team member, not as you.</li>
        <li>As a direct message they reach your Cliq from that account, and your replies are read from that same chat. In a channel you are tagged instead.</li>
        <li>To send from your own account, add a second Cliq connection signed in as you (Agent &gt; Connections). A message to yourself may not work, so a dedicated &quot;Crew&quot; Zoho user is the better long-term choice.</li>
      </ul>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) setCommands(false); }} />
        Send agent messages to Cliq
      </label>
      <label htmlFor="cliq-destination" className="mb-1 block text-xs font-medium">1. Where should messages go?</label>
      <select
        id="cliq-destination"
        value={dm ? 'dm' : 'channel'}
        onChange={(e) => { setDm(e.target.value === 'dm'); setConnection(''); }}
        className="mb-3 h-9 w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="dm">Me, as a direct message (my own Cliq)</option>
        <option value="channel">A channel</option>
      </select>
      <label htmlFor="cliq-connection" className="mb-1 block text-xs font-medium">{dm ? '2. Which Zoho sign-in to use' : '2. Which channel'}</label>
      <select id="cliq-connection" value={connection} onChange={(e) => setConnection(e.target.value)} className="mb-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
        <option value="">{dm ? 'Choose the Zoho sign-in…' : 'Choose the Cliq channel…'}</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name}{!dm && c.config.channel ? ` (#${c.config.channel})` : ''}</option>)}
      </select>
      {dm && (
        <p className="mb-3 text-xs text-muted-foreground" data-testid="cliq-dm-note">
          {connectionName ? `Messages arrive from ${connectionName} in your Cliq.` : 'Messages arrive in your Cliq from the account you pick here.'}
          {' '}Only your own messages in your chat with that account are read as commands; anything that account itself writes is ignored.
          {' '}Heads up: the Ops Agent itself only tags people in a channel, so direct messages are new and not yet proven with your Zoho account. If one does not arrive, choose &quot;A channel&quot;: you are tagged with your linked Cliq id, the way the Ops Agent tags everyone else.
          {list.length === 0 && ' No connection that signs in with Zoho was found: set one up under Agent > Connections.'}
        </p>
      )}
      {!dm && <div className="mb-3" />}
      <div className="mb-3 grid gap-1 sm:grid-cols-2">
        {KINDS.map((k) => (
          <label key={k.key} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={kinds.includes(k.key)} onChange={() => toggleKind(k.key)} />{k.label}
          </label>
        ))}
      </div>
      <div className="mb-3 rounded-md border bg-muted/30 p-3">
        <p className="mb-2 text-xs" data-testid="cliq-link-status">
          {linked
            ? <span className="text-muted-foreground">Your profile is linked in the Ops Agent, so your Cliq account is already known. Type an id below only to override it.</span>
            : (
              <span className="text-muted-foreground">
                Your profile has no Cliq id yet. Add it where the Ops Agent keeps everyone&apos;s: <a className="underline" href="/agent/settings/team">Agent &gt; Settings &gt; Team</a>, find your row, type your Cliq user id and Save. Or type it below.
              </span>
            )}
        </p>
        <label htmlFor="cliq-owner-id" className="mb-1 block text-xs font-medium">My Cliq user id or email{linked ? ' (optional override)' : dm ? ' (needed: this is who the direct message goes to)' : ''}</label>
        <input
          id="cliq-owner-id"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={ownerBad || ((commands || (dm && enabled)) && !idKnown)}
          aria-describedby="cliq-owner-help"
          className="mb-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
          placeholder="for example 20012345678 or you@company.com"
        />
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={commands} onChange={(e) => setCommands(e.target.checked)} />
          Let me approve, reject and reply from Cliq
        </label>
        <p id="cliq-owner-help" className="text-xs text-muted-foreground">
          Only messages from your Cliq account are obeyed; everyone else is ignored. High-risk approvals need the word confirm. Payments are never approved from Cliq.
          {' '}Commands work {dm ? 'in your direct chat' : 'in the channel above'}: approve a1b2c3, reject a1b2c3 reason, hale: your message, status.
        </p>
        {ownerBad && <p role="alert" className="mt-1 text-xs text-destructive">Use only letters, digits and . _ @ + - (2 to 120 characters).</p>}
        {dm && enabled && !ownerBad && !dmOk && <p role="alert" className="mt-1 text-xs text-destructive">For a direct message, choose the Zoho sign-in and make sure your Cliq account is known (linked, or typed above).</p>}
        {commands && !ownerBad && !commandsOk && <p role="alert" className="mt-1 text-xs text-destructive">Turn on Cliq alerts above, choose where messages go, and make sure your Cliq account is known (linked, or typed above).</p>}
      </div>
      {problem && (
        <p role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Cliq problem: {problem}
        </p>
      )}
      <Button size="sm" disabled={!valid || save.isPending || !settings.data} onClick={() => save.mutate({
        enabled, connection: connection || null, profile: me, kinds,
        ...(commandsChanged ? { commands, ownerId: ownerTrim } : {}), ...(dmChanged ? { dm } : {}),
      }, {
        onSuccess: () => toast({ title: commands ? 'Saved: you can approve, reject and reply from Cliq' : enabled ? (dm ? 'Saved: agent messages will be sent to you in Cliq' : 'Saved: agent messages will also appear in Cliq') : 'Saved: Cliq alerts are off' }),
        onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
      })}>Save</Button>
    </div>
  );
}
