import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCrewAgents, useIssueToken } from '../useCrew';

/**
 * Makes one key per executive and saves them in a file (crew-daemon.env) for the Crew daemon on the owner's PC. The keys are made in the owner's
 * browser and saved straight to his computer: nobody else sees them, they are not shown on screen. Each key only opens the Crew gateway for that
 * one executive (no writing, paying or deploying). Older keys keep working until they are revoked.
 */
export function DaemonKeys() {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const issue = useIssueToken();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const list = agents.data ?? [];
    if (list.length === 0) return;
    setBusy(true);
    try {
      const lines = ['# The Crew daemon keys. Private: never commit or send this file.', '# Made ' + new Date().toISOString()];
      for (const a of list) {
        const token = await issue.mutateAsync({ slug: a.slug, label: 'pc daemon' });
        lines.push('KEY_' + a.slug.toUpperCase() + '=' + token);
      }
      const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'crew-daemon.env';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast({ title: 'Keys saved', description: 'crew-daemon.env is in your Downloads. Put it in tools/crew-daemon and follow the README there.' });
    } catch (e) {
      toast({ title: 'Could not make the keys', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Run the executives on this PC</h3>
      <p className="text-xs text-muted-foreground">
        The Crew daemon runs them on your computer with your Claude login, only while the PC is on, and only when something is waiting. This saves one key per executive in a
        private file for it. Nothing is shown on screen.
      </p>
      <Button size="sm" variant="outline" disabled={busy || (agents.data ?? []).length === 0} onClick={() => void run()}>
        <Download className="mr-1.5 h-4 w-4" />{busy ? 'Making the keys…' : 'Download keys for the PC'}
      </Button>
    </div>
  );
}
