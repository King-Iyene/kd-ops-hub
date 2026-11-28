import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import type { MessageKind } from '../crewDb';
import { useCliqConnections, useCrewSettings, useSaveCrewSettings } from '../useCrew';

const KINDS: { key: MessageKind; label: string }[] = [
  { key: 'challenge', label: 'Challenges to your orders' },
  { key: 'alert', label: 'Alerts and problems' },
  { key: 'reminder', label: 'Reminders' },
  { key: 'report', label: 'Reports' },
  { key: 'brief', label: 'Briefings' },
  { key: 'message', label: 'Every message' },
];

/** The same rule the database applies to the Cliq account that may give commands. */
const CLIQ_ID = /^[A-Za-z0-9._@+-]{2,120}$/;

/**
 * Where an agent's message to you is also posted in Zoho Cliq. It uses the Cliq connections already set up for the Ops Agent: the message
 * goes into the channel you pick and you are tagged. Off until you turn it on. Saving only happens from the button.
 */
export function CliqSettings() {
  const { toast } = useToast();
  const me = useAuthStore((s) => s.profile?.id ?? null);
  const settings = useCrewSettings();
  const connections = useCliqConnections();
  const save = useSaveCrewSettings();
  const [enabled, setEnabled] = useState(false);
  const [connection, setConnection] = useState('');
  const [kinds, setKinds] = useState<string[]>(['alert', 'challenge', 'reminder']);
  const [commands, setCommands] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!settings.data || loaded) return;
    setEnabled(settings.data.cliq_enabled);
    setConnection(settings.data.cliq_connection_id ?? '');
    setKinds(settings.data.notify_kinds);
    setCommands(settings.data.cliq_commands_enabled ?? false);
    setOwnerId(settings.data.cliq_owner_id ?? '');
    setLoaded(true);
  }, [settings.data, loaded]);

  const toggleKind = (k: string) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const ownerTrim = ownerId.trim();
  const ownerBad = ownerTrim !== '' && !CLIQ_ID.test(ownerTrim);
  // Commands share the alerts' channel, and only the account typed here is obeyed, so all three must be set before they can be on.
  const commandsOk = !commands || (enabled && connection !== '' && CLIQ_ID.test(ownerTrim));
  const valid = kinds.length > 0 && (!enabled || connection !== '') && !ownerBad && commandsOk;
  // Sent only when changed, so saving the alerts alone never depends on the commands part.
  const savedCommands = settings.data?.cliq_commands_enabled ?? false;
  const savedOwner = settings.data?.cliq_owner_id ?? '';
  const commandsChanged = commands !== savedCommands || ownerTrim !== savedOwner;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 text-sm font-medium">Cliq alerts</div>
      <p className="mb-3 text-xs text-muted-foreground">When an agent writes to you, also post it in a Cliq channel and tag you. It uses the Cliq connections the Ops Agent already has. The agents never post anywhere themselves.</p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) setCommands(false); }} />
        Send agent messages to Cliq
      </label>
      <select value={connection} onChange={(e) => setConnection(e.target.value)} className="mb-3 h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Cliq channel">
        <option value="">Choose the Cliq channel…</option>
        {(connections.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.config.channel ? ` (#${c.config.channel})` : ''}</option>)}
      </select>
      <div className="mb-3 grid gap-1 sm:grid-cols-2">
        {KINDS.map((k) => (
          <label key={k.key} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={kinds.includes(k.key)} onChange={() => toggleKind(k.key)} />{k.label}
          </label>
        ))}
      </div>
      <div className="mb-3 rounded-md border bg-muted/30 p-3">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={commands} onChange={(e) => setCommands(e.target.checked)} />
          Let me approve, reject and reply from Cliq
        </label>
        <label htmlFor="cliq-owner-id" className="mb-1 block text-xs font-medium">My Cliq user id or email</label>
        <input
          id="cliq-owner-id"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={ownerBad || (commands && ownerTrim === '')}
          aria-describedby="cliq-owner-help"
          className="mb-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
          placeholder="for example 20012345678 or you@company.com"
        />
        <p id="cliq-owner-help" className="text-xs text-muted-foreground">
          Only messages from this Cliq account are obeyed; everyone else in the channel is ignored. High-risk approvals need the word confirm. Payments are never approved from Cliq.
          {' '}Commands work in the channel above: approve a1b2c3, reject a1b2c3 reason, hale: your message, status.
        </p>
        {ownerBad && <p role="alert" className="mt-1 text-xs text-destructive">Use only letters, digits and . _ @ + - (2 to 120 characters).</p>}
        {commands && !ownerBad && !commandsOk && <p role="alert" className="mt-1 text-xs text-destructive">Turn on Cliq alerts above, choose the channel, and type your Cliq id or email.</p>}
      </div>
      <Button size="sm" disabled={!valid || save.isPending || !settings.data} onClick={() => save.mutate({ enabled, connection: connection || null, profile: me, kinds, ...(commandsChanged ? { commands, ownerId: ownerTrim } : {}) }, {
        onSuccess: () => toast({ title: commands ? 'Saved: you can approve, reject and reply from Cliq' : enabled ? 'Saved: agent messages will also appear in Cliq' : 'Saved: Cliq alerts are off' }),
        onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
      })}>Save</Button>
    </div>
  );
}
