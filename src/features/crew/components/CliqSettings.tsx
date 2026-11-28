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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!settings.data || loaded) return;
    setEnabled(settings.data.cliq_enabled);
    setConnection(settings.data.cliq_connection_id ?? '');
    setKinds(settings.data.notify_kinds);
    setLoaded(true);
  }, [settings.data, loaded]);

  const toggleKind = (k: string) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const valid = kinds.length > 0 && (!enabled || connection !== '');

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 text-sm font-medium">Cliq alerts</div>
      <p className="mb-3 text-xs text-muted-foreground">When an agent writes to you, also post it in a Cliq channel and tag you. It uses the Cliq connections the Ops Agent already has. The agents never post anywhere themselves.</p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
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
      <Button size="sm" disabled={!valid || save.isPending || !settings.data} onClick={() => save.mutate({ enabled, connection: connection || null, profile: me, kinds }, {
        onSuccess: () => toast({ title: enabled ? 'Saved: agent messages will also appear in Cliq' : 'Saved: Cliq alerts are off' }),
        onError: (e) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
      })}>Save</Button>
    </div>
  );
}
