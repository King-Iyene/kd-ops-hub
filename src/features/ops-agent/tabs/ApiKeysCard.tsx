import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { confirm } from '@/hooks/use-confirm';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/queries/useOpsAgent';
import { Section } from '../settings/shared';
import { useAgentToast } from '../settings/useAgentToast';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'}/functions/v1/agent-inbound`;

const EXAMPLE = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Invoice sync failed","message":"3 invoices stuck","severity":"high","id":"inv-42","person_email":"someone@company.com"}'`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="outline" aria-label={label} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
      {done ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {done ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** How other systems tell the agent something: a key, an address, and one example. A key is shown once, when it is made. */
export function ApiKeysCard() {
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const toast = useAgentToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [fresh, setFresh] = useState<string | null>(null);

  const scopes = [canRead && 'flags:read', canWrite && 'flags:write'].filter(Boolean) as string[];
  const make = () => create.mutate({ name: name.trim(), scopes }, {
    onSuccess: (r) => { setFresh(r.key); setName(''); },
    onError: toast.failed,
  });
  const close = (v: boolean) => { setOpen(v); if (!v) { setFresh(null); setName(''); } };

  return (
    <Section title="Receive from other systems" description="Billing tools, n8n, monitoring: anything that can send a web request can add an item to the Inbox, or read the open ones. Nothing it sends changes a record.">
      <div className="space-y-2">
        <p className="text-sm font-medium">Address</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-muted px-2 py-1 text-xs" data-testid="inbound-endpoint">{ENDPOINT}</code>
          <CopyButton text={ENDPOINT} label="Copy the address" />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Show an example call</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">{EXAMPLE}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Fields: <code>title</code> (required), <code>message</code>, <code>severity</code> (info, low, medium, high, critical), <code>id</code> (sending the same id again updates the same item),
            <code> person_email</code>, <code>data</code>. GET the same address with <code>?limit=50</code> to read open items. 60 calls a minute per key.
          </p>
        </details>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">API keys</p>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="key-new"><KeyRound className="mr-2 h-3.5 w-3.5" /> New key</Button>
        </div>
        {keys.isLoading ? <Skeleton className="h-12 w-full" /> : keys.isError ? (
          <p className="text-sm text-destructive" role="alert">Keys could not be loaded: {keys.error.message}</p>
        ) : (keys.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No keys yet.</p> : (
          <ul className="space-y-2" data-testid="api-keys">
            {keys.data!.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <span className="font-medium">{k.name}</span>
                <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                {k.scopes.map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                <span className="text-xs text-muted-foreground">{k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleString()}` : 'never used'}</span>
                <span className="flex-1" />
                {k.revoked_at ? <Badge variant="outline" className="text-destructive">Revoked</Badge> : (
                  <Button size="sm" variant="ghost" disabled={revoke.isPending}
                    onClick={async () => { if (await confirm({ title: `Revoke ${k.name}?`, description: 'Anything using this key stops working at once. This cannot be undone.', confirmLabel: 'Revoke', variant: 'destructive' })) revoke.mutate(k.id, { onSuccess: () => toast.saved('Key revoked'), onError: toast.failed }); }}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-lg" data-testid="key-dialog">
          <DialogHeader>
            <DialogTitle>{fresh ? 'Copy your key now' : 'New API key'}</DialogTitle>
            <DialogDescription>{fresh ? 'This is the only time it is shown. Store it in the other system, then close this window.' : 'Give it a name that says who will use it.'}</DialogDescription>
          </DialogHeader>
          {fresh ? (
            <div className="space-y-2">
              <code className="block break-all rounded bg-muted p-3 text-xs" data-testid="key-fresh">{fresh}</code>
              <CopyButton text={fresh} label="Copy the key" />
            </div>
          ) : (
            <div className="space-y-3">
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Billing system" aria-label="Key name" />
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={canWrite} onCheckedChange={(c) => setCanWrite(c === true)} /> May add items (flags:write)</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={canRead} onCheckedChange={(c) => setCanRead(c === true)} /> May read open items (flags:read)</label>
            </div>
          )}
          <DialogFooter>
            {fresh ? <Button onClick={() => close(false)}>I have copied it</Button> : (
              <>
                <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
                <Button onClick={make} disabled={!name.trim() || scopes.length === 0 || create.isPending} data-testid="key-create">
                  {create.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Create key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
